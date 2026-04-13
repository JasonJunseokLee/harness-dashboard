import {
  SUPPORTED_PHASES,
  PHASE_FORMAT,
  PROMPT_TEMPLATES as PHASE_PROMPT_TEMPLATES,
  sanitizeAndValidateJson,
  getPhaseDir as libGetPhaseDir,
  isSupportedPhase,
} from '@/app/lib/ai-phase-config'

// ─── Phase 검증 (런타임 타입 가드) ──────────────────────────────
export function isValidPhase(value: string): value is typeof SUPPORTED_PHASES[number] {
  return isSupportedPhase(value)
}

// ─── Phase 디렉토리 경로 ─────────────────────────────────────────
export function getPhaseDir(phase: string): string {
  if (!isValidPhase(phase)) {
    throw new Error(`Invalid phase: ${phase}`)
  }
  return libGetPhaseDir(phase)
}

// ─── Phase 포맷 조회 ────────────────────────────────────────────
export function getPhaseFormat(phase: string): 'markdown' | 'json' {
  if (!isValidPhase(phase)) {
    throw new Error(`Invalid phase: ${phase}`)
  }
  return PHASE_FORMAT[phase]
}

// ─── Phase별 프롬프트 템플릿 ──────────────────────────────────────
export const PROMPT_TEMPLATES = PHASE_PROMPT_TEMPLATES as Record<
  string,
  (context: string, instruction: string) => string
>

// ─── JSON 파싱 및 정제 헬퍼 ────────────────────────────────────────
// claude 가 ```json ... ``` 으로 감싸거나 주석을 섞을 수 있으므로
// 정제 후 JSON.parse 를 시도한다.
//
// 반환값:
//   - ok=true: { ok: true, parsed: any, cleaned: string }
//   - ok=false: { ok: false, error: string, cleaned: string }
export function tryParseJson(
  raw: string
): { ok: true; parsed: any; cleaned: string } | { ok: false; error: string; cleaned: string } {
  const result = sanitizeAndValidateJson(raw)

  if (result.ok) {
    return {
      ok: true,
      parsed: JSON.parse(result.cleaned),
      cleaned: result.cleaned,
    }
  } else {
    return {
      ok: false,
      error: result.error,
      cleaned: raw.trim(),
    }
  }
}
