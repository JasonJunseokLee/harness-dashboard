// ─────────────────────────────────────────────────────────────
// ai-phase-config.ts
//   대화형 수정(Refine) API에서 사용하는 phase(= 수정 대상)별
//   설정을 한 곳에 모아둔 파일.
//
//   - phase 허용 목록 검증 (isSupportedPhase)
//   - phase → 디렉토리 매핑 (getPhaseDir)
//   - phase → 프롬프트 템플릿 매핑 (PROMPT_TEMPLATES)
//   - phase → 출력 포맷 매핑 (PHASE_FORMAT)
//   - JSON 정제 & 검증 (sanitizeAndValidateJson)
//
//   새 phase를 추가하려면 이 파일만 수정하면 라우트 전체가 자동 지원.
// ─────────────────────────────────────────────────────────────

// 지원하는 phase 식별자 (design.md Phase A 범위)
// onboarding-* 은 후속 작업에서 활성화 예정이지만 런타임 가드는 미리 허용
export const SUPPORTED_PHASES = [
  'claude-md',
  'prd',
  'sprint-plan',
  'ralph-loop',
  'onboarding-analysis',
  'onboarding-questions',
] as const

export type Phase = (typeof SUPPORTED_PHASES)[number]

// phase별 출력 포맷: 버전 저장 시 파싱 검증 여부 결정
// - markdown: 그대로 저장
// - json: JSON.parse 성공해야 버전 저장
export type PhaseFormat = 'markdown' | 'json'

export const PHASE_FORMAT: Record<Phase, PhaseFormat> = {
  'claude-md': 'markdown',
  prd: 'json',
  'sprint-plan': 'json',
  'ralph-loop': 'json',
  'onboarding-analysis': 'json',
  'onboarding-questions': 'json',
}

// phase → .harness/ai-results/{phase} 디렉토리 경로
// AIVersionManager 생성자에 넘기는 phaseDir 로 그대로 사용
export function getPhaseDir(phase: Phase): string {
  return `.harness/ai-results/${phase}`
}

// 허용되지 않은 phase 값인지 검사 (런타임 가드)
export function isSupportedPhase(value: string): value is Phase {
  return (SUPPORTED_PHASES as readonly string[]).includes(value)
}

// isValidPhase 는 isSupportedPhase 의 별칭(_shared.ts 계열 라우트 호환용)
export const isValidPhase = isSupportedPhase

// ─── 프롬프트 템플릿 ──────────────────────────────────────────
// claude -p 로 전달되는 프롬프트를 phase별로 구성한다.
// 공통 원칙:
//   1. 도구 사용 금지 (파일 읽기/쓰기/터미널 실행 X) → stdout만
//   2. 기존 내용을 기반으로 "전체"를 다시 출력 (부분 수정 금지)
//   3. JSON phase는 백틱/주석 없이 순수 JSON 만 요구
// -------------------------------------------------------------

type PromptBuilder = (context: string, instruction: string) => string

// 마크다운(claude-md)용 프롬프트
const markdownPrompt: PromptBuilder = (context, instruction) => `[중요] 파일 읽기, 파일 쓰기, 터미널 실행 등 어떤 도구도 사용하지 마세요. 오직 마크다운 텍스트만 stdout으로 출력하세요.

당신은 시니어 소프트웨어 엔지니어이자 AI 협업 전문가입니다.

아래는 기존 CLAUDE.md 파일 내용입니다:

━━━ 현재 CLAUDE.md ━━━
${context}
━━━━━━━━━━━━━━━━━━━

사용자의 수정 요청:
${instruction}

위 요청에 따라 CLAUDE.md 전체를 수정하여 출력하세요.
- 기존 구조를 유지하면서 요청된 부분만 변경합니다
- 변경하지 않는 부분도 그대로 포함해야 합니다 (전체 파일 출력)
- 마크다운 형식으로만 응답하세요.`

// JSON 계열 phase 용 프롬프트 생성기
// phaseLabel 은 프롬프트 안에서 "기존 ○○ JSON" 처럼 사람이 읽는 이름
const makeJsonPrompt =
  (phaseLabel: string): PromptBuilder =>
  (context, instruction) => `[중요] 파일 읽기, 파일 쓰기, 터미널 실행 등 어떤 도구도 사용하지 마세요. 오직 JSON만 stdout으로 출력하세요.
[중요] 백틱(\`\`\`), 마크다운 코드블록, 주석, 설명, 앞뒤 텍스트 모두 금지. 순수 JSON 한 덩어리만 출력하세요.

당신은 시니어 프로덕트 매니저이자 AI 협업 전문가입니다.

아래는 기존 ${phaseLabel} JSON 입니다:

━━━ 현재 JSON ━━━
${context}
━━━━━━━━━━━━━━━

사용자의 수정 요청:
${instruction}

위 요청에 따라 전체 JSON을 수정하여 출력하세요.
- 기존 스키마(키 이름/구조)를 유지합니다
- 변경하지 않는 필드도 그대로 포함해야 합니다 (전체 JSON 출력)
- 출력 형식: 순수 JSON 오브젝트 1개. 백틱/주석/설명 금지.`

// phase → 프롬프트 빌더 맵
export const PROMPT_TEMPLATES: Record<Phase, PromptBuilder> = {
  'claude-md': markdownPrompt,
  prd: makeJsonPrompt('PRD'),
  'sprint-plan': makeJsonPrompt('스프린트 계획'),
  'ralph-loop': makeJsonPrompt('Ralph Loop 설정'),
  'onboarding-analysis': makeJsonPrompt('온보딩 분석'),
  'onboarding-questions': makeJsonPrompt('온보딩 질문'),
}

// ─── JSON 정제 & 검증 헬퍼 ────────────────────────────────────
// claude 가 가끔 ```json ... ``` 으로 감싸서 출력하는 경우가 있어
// 앞뒤 백틱 블록을 벗겨낸 뒤 JSON.parse 를 시도한다.
//
// 성공: { ok: true, cleaned: string }  (정제된 JSON 문자열)
// 실패: { ok: false, error: string }   (파싱 실패 사유)
// -------------------------------------------------------------
export function sanitizeAndValidateJson(
  raw: string
): { ok: true; cleaned: string } | { ok: false; error: string } {
  let text = raw.trim()

  // ```json ... ``` 또는 ``` ... ``` 형태면 벗겨낸다
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-zA-Z0-9]*\s*\n?/, '')
    text = text.replace(/\n?```\s*$/, '')
    text = text.trim()
  }

  try {
    // 파싱이 성공해야만 저장 허용
    JSON.parse(text)
    return { ok: true, cleaned: text }
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 파싱 오류'
    return { ok: false, error: `JSON 파싱 실패: ${message}` }
  }
}
