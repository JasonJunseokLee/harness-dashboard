import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { getHarnessDir } from '@/app/lib/project-path'

export const runtime = 'nodejs'

function loadJson(file: string) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch { return null }
}

// ─── GET: 저장된 스프린트 플랜 반환 ──────────────────────────
export async function GET(req: NextRequest) {
  const HARNESS = getHarnessDir()
  const CACHE_FILE = path.join(HARNESS, 'sprint-plan.md')
  const PREV_FILE = path.join(HARNESS, 'sprint-plan.prev.md')
  const { searchParams } = new URL(req.url)
  if (searchParams.get('prev') === 'true') {
    if (fs.existsSync(PREV_FILE)) {
      return NextResponse.json({ exists: true, content: fs.readFileSync(PREV_FILE, 'utf-8') })
    }
    return NextResponse.json({ exists: false, content: '' })
  }
  if (fs.existsSync(CACHE_FILE)) {
    return NextResponse.json({ exists: true, content: fs.readFileSync(CACHE_FILE, 'utf-8') })
  }
  return NextResponse.json({ exists: false, content: '' })
}

// ─── PUT: 편집된 내용 저장 ────────────────────────────────────
export async function PUT(req: NextRequest) {
  const HARNESS = getHarnessDir()
  const CACHE_FILE = path.join(HARNESS, 'sprint-plan.md')
  const { content } = await req.json()
  if (!content) return NextResponse.json({ error: '내용이 없습니다.' }, { status: 400 })
  if (!fs.existsSync(HARNESS)) fs.mkdirSync(HARNESS, { recursive: true })
  fs.writeFileSync(CACHE_FILE, content, 'utf-8')
  return NextResponse.json({ success: true })
}

// ─── POST: claude -p 로 스프린트 플랜 생성 (SSE 스트리밍) ─────
export async function POST(req: NextRequest) {
  const HARNESS = getHarnessDir()
  const CACHE_FILE = path.join(HARNESS, 'sprint-plan.md')
  const PREV_FILE = path.join(HARNESS, 'sprint-plan.prev.md')
  const body = await req.json().catch(() => ({}))
  const instruction: string = body.instruction ?? ''
  const project = loadJson(path.join(HARNESS, 'project.json'))
  const prd = loadJson(path.join(HARNESS, 'prd.json'))
  const features = loadJson(path.join(HARNESS, 'features.json'))
  const workflow = loadJson(path.join(HARNESS, 'workflow.json'))

  if (!project) {
    return new Response(JSON.stringify({ error: '온보딩을 먼저 완료해주세요.' }), { status: 400 })
  }

  // 기능 목록 추출
  const nodes = (features?.treeNodes as Array<{ id: string; type: string; label: string; parentId?: string }> | undefined) ?? []
  const categories = nodes.filter(n => n.type === 'category')
  const featureNodes = nodes.filter(n => n.type === 'feature')
  const subFeatures = nodes.filter(n => n.type === 'subfeature')

  const featureList = featureNodes.map(f => {
    const cat = categories.find(c => c.id === f.parentId)
    const subs = subFeatures.filter(s => s.parentId === f.id)
    const subText = subs.length ? ` (세부: ${subs.map(s => s.label).join(', ')})` : ''
    return `- ${cat ? cat.label + ' > ' : ''}${f.label}${subText}`
  }).join('\n')

  // PRD 정보
  const oneLiner = (prd?.overview as Record<string, string> | undefined)?.oneLiner ?? project.description
  const kpis = (prd?.success as { kpis?: string[] } | undefined)?.kpis ?? []

  // 기술 스택
  const ts = project.techStack as Record<string, string[] | string> | undefined
  const stackSummary = [
    ts?.frontend && Array.isArray(ts.frontend) && ts.frontend.length ? ts.frontend.join(', ') : null,
    ts?.backend && Array.isArray(ts.backend) && ts.backend.length ? ts.backend.join(', ') : null,
  ].filter(Boolean).join(' / ') || '미정'

  // 워크플로우 노드
  const wfNodes = (workflow?.nodes as Array<{ data?: { label?: string } }> | undefined) ?? []
  const wfSteps = wfNodes.filter(n => n.data?.label).map(n => `- ${n.data!.label}`).join('\n')

  const instructionSection = instruction.trim()
    ? `\n[사용자 추가 지시사항 — 최우선으로 반영하세요]\n${instruction.trim()}\n`
    : ''

  // 재생성 시 기존 캐시 삭제 (claude가 파일 읽고 "이미 존재" 응답하는 것 방지)
  if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE)

  const prompt = `[중요] 파일 읽기, 파일 쓰기, 터미널 실행 등 어떤 도구도 사용하지 마세요. 오직 마크다운 텍스트만 stdout으로 출력하세요.

당신은 애자일 프로젝트 매니저이자 소프트웨어 아키텍트입니다.${instructionSection}
아래 프로젝트 정보를 바탕으로 실행 가능한 스프린트 플랜을 작성하세요.

━━━ 프로젝트 정보 ━━━
[프로젝트]
${oneLiner}

[기술 스택]
${stackSummary}

[핵심 KPI]
${kpis.map(k => `- ${k}`).join('\n') || '(없음)'}

[기능 목록]
${featureList || '(없음)'}

[유저 워크플로우 주요 단계]
${wfSteps || '(없음)'}
━━━━━━━━━━━━━━━━━━━

아래 형식으로 스프린트 플랜을 작성하세요:

# 스프린트 플랜

## 개요
- 예상 총 스프린트 수
- 각 스프린트 기간 (1~2주 권장)
- 핵심 원칙 (예: MVP 우선, 의존성 순서 등)

## 스프린트 구성

### Sprint 0 — 프로젝트 셋업
**목표**: 개발 환경 및 기반 구조 세팅
**산출물**:
- [ ] 항목1
- [ ] 항목2
**Definition of Done**: 기준 서술
**예상 기간**: N일

각 기능 스프린트마다 위 형식 반복.

## 스프린트별 의존성 다이어그램
\`\`\`
Sprint 0 → Sprint 1 → Sprint 2
                    → Sprint 3
\`\`\`

## 리스크 & 완충 전략
주요 리스크와 대응 방안

## MVP vs Full 버전 구분
| 기능 | MVP | Full |
|------|-----|------|
| ... | ✓ | ✓ |

기능 수에 따라 적절히 4~8개 스프린트로 구성하세요.
의존성을 고려해 순서를 정하고, 각 스프린트는 독립적으로 검증 가능해야 합니다.`

  const enc = new TextEncoder()
  let fullContent = ''
  let lastSavedLength = 0

  // 스트리밍 중 파일을 주기적으로 저장 (생성 도중 중단되어도 부분 결과가 남도록)
  function savePartial() {
    if (fullContent.length > lastSavedLength) {
      if (!fs.existsSync(HARNESS)) fs.mkdirSync(HARNESS, { recursive: true })
      fs.writeFileSync(CACHE_FILE, fullContent, 'utf-8')
      lastSavedLength = fullContent.length
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))

      const proc = spawn('claude', ['-p', prompt], {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      // 500자 쌓일 때마다 중간 저장
      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        fullContent += text
        send({ type: 'text', text })
        if (fullContent.length - lastSavedLength > 500) savePartial()
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        const msg = chunk.toString().trim()
        if (msg) send({ type: 'error', text: msg })
      })

      proc.on('close', () => {
        // .harness/sprint-plan.md 에 저장
        if (!fs.existsSync(HARNESS)) fs.mkdirSync(HARNESS, { recursive: true })
        fs.writeFileSync(CACHE_FILE, fullContent, 'utf-8')

        // setup.json 업데이트
        const setupFile = path.join(HARNESS, 'setup.json')
        const existing = fs.existsSync(setupFile)
          ? JSON.parse(fs.readFileSync(setupFile, 'utf-8'))
          : {}
        fs.writeFileSync(setupFile, JSON.stringify({ ...existing, sprintPlan: true, updatedAt: new Date().toISOString() }, null, 2))

        send({ type: 'done' })
        controller.close()
      })

      proc.on('error', (err: Error) => {
        send({ type: 'error', text: err.message })
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}
