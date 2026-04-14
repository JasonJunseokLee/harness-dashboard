import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import { getHarnessDir } from '@/app/lib/project-path'

export const runtime = 'nodejs'

// 하네스 엔지니어링 템플릿 폴더 (우선순위: 환경변수 → 외부 별도 폴더 → 번들 내장 경로)
const BUNDLED_TEMPLATE_ROOT = path.join(process.cwd(), 'harness-templates')
const TEMPLATE_ROOT = process.env.HARNESS_TEMPLATE_PATH
  || path.join(process.env.HOME || process.env.USERPROFILE || '', 'CascadeProjects', 'Harness Engeineering Template')

function loadJson(file: string) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch { return null }
}

function readFileSafe(filePath: string): string {
  try { return fs.readFileSync(filePath, 'utf-8') } catch { return '' }
}

// 템플릿 파일을 읽을 때 외부 폴더 → 번들 폴더 순으로 폴백
function resolveTemplatePath(relativeFile: string): string {
  const externalPath = path.join(TEMPLATE_ROOT, relativeFile)
  if (fs.existsSync(externalPath)) return externalPath
  // 번들 폴더는 서브디렉토리 없이 파일명만 사용 (docs/, templates/ 접두사 제거)
  const bundledPath = path.join(BUNDLED_TEMPLATE_ROOT, path.basename(relativeFile))
  return bundledPath
}

// ─── 템플릿 목록 정의 ─────────────────────────────────────────
export const TEMPLATES = [
  // 실행 템플릿 (프로젝트에 맞게 AI 튜닝 가능)
  {
    id: 'spec',
    category: 'action' as const,
    file: 'templates/spec-template.md',
    label: '제품 스펙 (Spec)',
    desc: 'Planner가 작성. 짧은 요청을 완전한 제품 설계로 확장하는 최상위 계약 문서.',
  },
  {
    id: 'sprint-contract',
    category: 'action' as const,
    file: 'templates/sprint-contract-template.md',
    label: '스프린트 계약서',
    desc: 'Generator·Evaluator가 스프린트 시작 전 합의하는 범위·산출물·평가 기준 문서.',
  },
  {
    id: 'completion-report',
    category: 'action' as const,
    file: 'templates/completion-report-template.md',
    label: '완료 보고서',
    desc: 'Generator가 구현 완료 후 QA에 제출하는 증거 기반 보고서.',
  },
  {
    id: 'evaluation-rubric',
    category: 'action' as const,
    file: 'templates/evaluation-rubric-template.md',
    label: '평가 기준표',
    desc: '프로젝트 전반에 걸쳐 일관된 QA 판정을 위한 채점 기준표.',
  },
  // 가이드 문서 (참조용, 뷰어 제공)
  { id: 'doc-01', category: 'doc' as const, file: 'docs/01-core-principles.md', label: '01 핵심 원칙', desc: '하네스 설계의 근간이 되는 5가지 원칙' },
  { id: 'doc-02', category: 'doc' as const, file: 'docs/02-architecture.md', label: '02 아키텍처 패턴', desc: '3-에이전트 구조, 컨텍스트 관리' },
  { id: 'doc-03', category: 'doc' as const, file: 'docs/03-context-handoff.md', label: '03 컨텍스트 핸드오프', desc: '세션 간 상태 보존 전략' },
  { id: 'doc-04', category: 'doc' as const, file: 'docs/04-evaluator-design.md', label: '04 Evaluator 설계', desc: '평가자 설계 원칙 및 채점 기준 설정' },
  { id: 'doc-05', category: 'doc' as const, file: 'docs/05-prompt-patterns.md', label: '05 프롬프트 패턴', desc: 'Generator/Evaluator 프롬프트 작성 패턴' },
  { id: 'doc-06', category: 'doc' as const, file: 'docs/06-harness-evolution.md', label: '06 하네스 진화', desc: '모델 발전에 따른 하네스 업데이트 원칙' },
  { id: 'doc-07', category: 'doc' as const, file: 'docs/07-cost-tradeoff.md', label: '07 비용 트레이드오프', desc: '품질 vs 비용 균형 결정 기준' },
  { id: 'doc-08', category: 'doc' as const, file: 'docs/08-when-to-use.md', label: '08 적용 판단', desc: '하네스 레벨 선택 체크리스트' },
  { id: 'doc-10', category: 'doc' as const, file: 'docs/10-hooks-and-skills.md', label: '10 Hooks & Skills', desc: '자동화 훅과 재사용 스킬 설계 가이드' },
  { id: 'doc-11', category: 'doc' as const, file: 'docs/11-visual-qa-protocol.md', label: '11 시각 QA 프로토콜', desc: '브라우저 기반 시각 검증 절차' },
  { id: 'doc-12', category: 'doc' as const, file: 'docs/12-failure-catalog.md', label: '12 실패 카탈로그', desc: '반복되는 실패 패턴과 방지법' },
  { id: 'doc-13', category: 'doc' as const, file: 'docs/13-multi-persona-qa.md', label: '13 멀티 페르소나 QA', desc: '디자이너·개발자·사용자 3-페르소나 검수' },
  { id: 'doc-14', category: 'doc' as const, file: 'docs/14-memory-and-state.md', label: '14 메모리 & 상태', desc: '세션 간 메모리 저장 원칙' },
]

// ─── GET: 전체 목록 + 선택된 파일 내용 반환 ──────────────────
export async function GET(req: NextRequest) {
  // 요청마다 현재 프로젝트 경로를 동적으로 조회 (프로젝트 전환 대응)
  const TUNED_DIR = path.join(getHarnessDir(), 'templates')
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  // 목록만 요청 (id 없을 때)
  if (!id) {
    const list = TEMPLATES.map(t => {
      const tunedPath = path.join(TUNED_DIR, path.basename(t.file))
      return {
        ...t,
        exists: fs.existsSync(resolveTemplatePath(t.file)),
        tuned: fs.existsSync(tunedPath),
      }
    })
    return NextResponse.json({ list, templateRoot: TEMPLATE_ROOT })
  }

  // 특정 파일 내용 요청
  const tmpl = TEMPLATES.find(t => t.id === id)
  if (!tmpl) return NextResponse.json({ error: '존재하지 않는 템플릿' }, { status: 404 })

  const originalPath = resolveTemplatePath(tmpl.file)
  const tunedPath = path.join(TUNED_DIR, path.basename(tmpl.file))

  const original = readFileSafe(originalPath)
  const tuned = fs.existsSync(tunedPath) ? readFileSafe(tunedPath) : ''

  return NextResponse.json({ id, original, tuned, hasTuned: !!tuned })
}

// ─── POST: 선택한 템플릿을 프로젝트에 맞게 AI 튜닝 (SSE) ─────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const id: string = body.id ?? ''
  const instruction: string = body.instruction ?? ''

  const tmpl = TEMPLATES.find(t => t.id === id)
  if (!tmpl) return new Response(JSON.stringify({ error: '존재하지 않는 템플릿' }), { status: 404 })

  // 원본 템플릿 읽기 (외부 폴더 없으면 번들 harness-templates/ 폴백)
  const originalPath = resolveTemplatePath(tmpl.file)
  const originalContent = readFileSafe(originalPath)
  if (!originalContent) {
    return new Response(JSON.stringify({ error: '템플릿 파일을 읽을 수 없습니다.' }), { status: 500 })
  }

  // 요청마다 현재 프로젝트 경로 동적 조회
  const HARNESS = getHarnessDir()
  const TUNED_DIR = path.join(HARNESS, 'templates')

  // 프로젝트 컨텍스트 수집
  const project = loadJson(path.join(HARNESS, 'project.json'))
  const prd = loadJson(path.join(HARNESS, 'prd.json'))
  const features = loadJson(path.join(HARNESS, 'features.json'))
  const sprintPlan = readFileSafe(path.join(HARNESS, 'sprint-plan.md'))
  const claudeMdCache = loadJson(path.join(HARNESS, 'setup-claudemd.json'))
  const designGuide = readFileSafe(path.join(HARNESS, 'design-system', 'design-guide.md'))

  if (!project) {
    return new Response(JSON.stringify({ error: '온보딩을 먼저 완료해주세요.' }), { status: 400 })
  }

  // 프로젝트 요약 텍스트 구성
  const prdOverview = (prd?.overview as Record<string, string> | undefined)
  const oneLiner = prdOverview?.oneLiner ?? project.description
  const problem = prdOverview?.problem ?? ''
  const solution = prdOverview?.solution ?? ''
  const targetUsers = (prd?.target as Record<string, string> | undefined)?.users ?? ''

  const ts = project.techStack as Record<string, string[] | string> | undefined
  const stackLines = [
    ts?.frontend && Array.isArray(ts.frontend) && ts.frontend.length ? `프론트: ${ts.frontend.join(', ')}` : null,
    ts?.backend && Array.isArray(ts.backend) && ts.backend.length ? `백엔드: ${ts.backend.join(', ')}` : null,
    ts?.styling && Array.isArray(ts.styling) && ts.styling.length ? `스타일: ${ts.styling.join(', ')}` : null,
    ts?.database && Array.isArray(ts.database) && ts.database.length ? `DB: ${ts.database.join(', ')}` : null,
  ].filter(Boolean).join(' / ') || '미정'

  // 기능 목록
  const nodes = (features?.treeNodes as Array<{ type: string; label: string; parentId?: string }> | undefined) ?? []
  const feats = nodes.filter(n => n.type === 'feature').slice(0, 12).map(n => `- ${n.label}`).join('\n') || '(없음)'

  // 스프린트 플랜 요약 (첫 500자)
  const sprintSummary = sprintPlan ? sprintPlan.slice(0, 500) : '(스프린트 플랜 없음)'

  const instructionSection = instruction.trim()
    ? `\n[사용자 추가 지시사항 — 최우선 반영]\n${instruction.trim()}\n`
    : ''

  // 액션 템플릿 vs 가이드 문서에 따라 다른 지시
  const taskInstruction = tmpl.category === 'action'
    ? `아래 프로젝트 정보를 바탕으로, 이 템플릿의 모든 [대괄호 항목], {중괄호 항목}, 빈칸, 예시 텍스트를 실제 프로젝트 값으로 대체하세요.
구조와 섹션은 그대로 유지하되, 모든 플레이스홀더를 프로젝트에 맞는 구체적인 내용으로 채우세요.
결과물은 이 팀이 내일 당장 사용할 수 있는 수준이어야 합니다.`
    : `아래 프로젝트 정보를 참고하여, 이 가이드 문서에서 이 프로젝트에 특히 중요한 원칙·패턴·체크리스트를 골라
프로젝트 맞춤형 요약 버전을 작성하세요.
원본 문서의 핵심은 유지하되, 이 프로젝트의 기술 스택·기능·팀 컨텍스트에 맞게 예시와 규칙을 구체화하세요.`

  const prompt = `[중요] 파일 읽기, 파일 쓰기, 터미널 실행 등 어떤 도구도 사용하지 마세요. 오직 마크다운 텍스트만 stdout으로 출력하세요.${instructionSection}

당신은 하네스 엔지니어링 전문가이자 프로젝트 아키텍트입니다.
${taskInstruction}

━━━ 프로젝트 컨텍스트 ━━━
[프로젝트]
${oneLiner}
${problem ? `문제: ${problem}` : ''}
${solution ? `해결: ${solution}` : ''}
${targetUsers ? `타겟: ${targetUsers}` : ''}

[기술 스택]
${stackLines}

[주요 기능]
${feats}

[스프린트 플랜 요약]
${sprintSummary}
${claudeMdCache?.content ? `\n[CLAUDE.md 핵심 내용 (앞 300자)]\n${(claudeMdCache.content as string).slice(0, 300)}` : ''}
${designGuide ? `\n[디자인 가이드 존재 여부]\n디자인 가이드가 .harness/design-system/design-guide.md에 있습니다.` : ''}
━━━━━━━━━━━━━━━━━━━

━━━ 튜닝할 원본 템플릿 ━━━
${originalContent}
━━━━━━━━━━━━━━━━━━━`

  // 기존 튜닝 버전 삭제 (재튜닝 시)
  const tunedPath = path.join(TUNED_DIR, path.basename(tmpl.file))
  if (fs.existsSync(tunedPath)) fs.unlinkSync(tunedPath)

  const enc = new TextEncoder()
  let fullContent = ''

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch { /* closed */ }
      }
      const close = () => { try { controller.close() } catch { /* already closed */ } }

      // 프롬프트를 stdin으로 전달 (긴 프롬프트의 ARG_MAX 한계 회피)
      const proc = spawn('claude', ['--print'], {
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      proc.stdin?.write(prompt)
      proc.stdin?.end()

      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        fullContent += text
        send({ type: 'text', text })
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        const msg = chunk.toString().trim()
        if (msg) send({ type: 'text', text: `▸ ${msg}\n` })
      })

      proc.on('close', () => {
        if (!fs.existsSync(TUNED_DIR)) fs.mkdirSync(TUNED_DIR, { recursive: true })
        fs.writeFileSync(tunedPath, fullContent, 'utf-8')
        send({ type: 'done' })
        close()
      })

      proc.on('error', (err: Error) => {
        send({ type: 'text', text: `▸ 오류: ${err.message}\n` })
        close()
      })
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}

// ─── PUT: 편집된 튜닝 버전 저장 ──────────────────────────────
export async function PUT(req: NextRequest) {
  const { id, content } = await req.json()
  const tmpl = TEMPLATES.find(t => t.id === id)
  if (!tmpl || !content) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })

  // 요청마다 현재 프로젝트 경로 동적 조회
  const TUNED_DIR = path.join(getHarnessDir(), 'templates')
  if (!fs.existsSync(TUNED_DIR)) fs.mkdirSync(TUNED_DIR, { recursive: true })
  const tunedPath = path.join(TUNED_DIR, path.basename(tmpl.file))
  fs.writeFileSync(tunedPath, content, 'utf-8')

  return NextResponse.json({ success: true, savedTo: tunedPath })
}
