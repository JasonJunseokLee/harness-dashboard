import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { getHarnessDir } from '@/app/lib/project-path'

export const runtime = 'nodejs'

function loadAnalysisSection(): string {
  const HARNESS = getHarnessDir()
  const ANALYSIS_FILE = path.join(HARNESS, 'context-analysis.json')
  if (!fs.existsSync(ANALYSIS_FILE)) return ''
  try {
    const a = JSON.parse(fs.readFileSync(ANALYSIS_FILE, 'utf-8'))
    return `[컨텍스트 분석 리포트 — 아래 인사이트를 워크플로우에 반영하세요]
사용자 문제: ${(a.userPainPoints ?? []).join(' / ')}
핵심 데이터: ${(a.keyData ?? []).join(' / ')}
도출 요구사항: ${(a.requirements ?? []).join(' / ')}`
  } catch { return '' }
}

export async function GET(req: NextRequest) {
  const HARNESS = getHarnessDir()
  const WORKFLOW_FILE = path.join(HARNESS, 'workflow.json')
  const WORKFLOW_PREV_FILE = path.join(HARNESS, 'workflow.prev.json')
  const isPrev = req.nextUrl.searchParams.get('prev') === 'true'
  const file = isPrev ? WORKFLOW_PREV_FILE : WORKFLOW_FILE
  if (!fs.existsSync(file)) return NextResponse.json({ exists: false })
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
  return NextResponse.json({ exists: true, data })
}

// PUT: 편집된 워크플로우 저장
export async function PUT(req: NextRequest) {
  const HARNESS = getHarnessDir()
  const WORKFLOW_FILE = path.join(HARNESS, 'workflow.json')
  const body = await req.json()
  if (!fs.existsSync(HARNESS)) fs.mkdirSync(HARNESS, { recursive: true })
  fs.writeFileSync(WORKFLOW_FILE, JSON.stringify(body, null, 2), 'utf-8')
  return NextResponse.json({ success: true })
}

export async function POST(req: NextRequest) {
  const HARNESS = getHarnessDir()
  const PRD_FILE = path.join(HARNESS, 'prd.json')
  const FEATURES_FILE = path.join(HARNESS, 'features.json')
  const WORKFLOW_FILE = path.join(HARNESS, 'workflow.json')
  const WORKFLOW_PREV_FILE = path.join(HARNESS, 'workflow.prev.json')

  const body = await req.json().catch(() => ({}))
  const instruction: string = body.instruction ?? ''

  if (!fs.existsSync(PRD_FILE)) {
    return new Response(JSON.stringify({ error: 'PRD를 먼저 생성해주세요' }), { status: 400 })
  }

  // 기존 워크플로우 백업
  if (fs.existsSync(WORKFLOW_FILE)) {
    fs.copyFileSync(WORKFLOW_FILE, WORKFLOW_PREV_FILE)
  }

  const prd = JSON.parse(fs.readFileSync(PRD_FILE, 'utf-8'))
  const features = fs.existsSync(FEATURES_FILE)
    ? JSON.parse(fs.readFileSync(FEATURES_FILE, 'utf-8'))
    : null

  // treeNodes 포맷 (신규) 또는 categories 포맷 (구버전) 모두 처리
  let featureList = ''
  if (features?.treeNodes) {
    // 신규: treeNodes 플랫 배열에서 feature/subfeature 추출
    const cats = features.treeNodes.filter((n: { type: string }) => n.type === 'category')
    const feats = features.treeNodes.filter((n: { type: string }) => n.type === 'feature')
    featureList = feats
      .map((f: { label: string; parentId: string }) => {
        const cat = cats.find((c: { id: string; label: string }) => c.id === f.parentId)
        return cat ? `${cat.label} > ${f.label}` : f.label
      })
      .slice(0, 12)
      .join('\n')
  } else if (features?.categories) {
    // 구버전 호환
    featureList = features.categories
      .flatMap((c: { name: string; features: { name: string }[] }) =>
        c.features.map((f: { name: string }) => `${c.name} > ${f.name}`)
      )
      .slice(0, 12)
      .join('\n')
  }

  const analysisSection = loadAnalysisSection()

  const instructionSection = instruction.trim()
    ? `\n[사용자 추가 지시사항 — 최우선으로 반영하세요]\n${instruction.trim()}\n`
    : ''

  const prompt = `당신은 UX 디자이너입니다. 아래 정보를 바탕으로 핵심 유저 워크플로우를 작성하세요.${instructionSection}

[서비스]
${prd.overview?.oneLiner ?? ''}

[타겟 사용자]
${prd.target?.users ?? ''}

[사용 시나리오]
${prd.target?.scenario ?? ''}

${featureList ? `[주요 기능]\n${featureList}\n` : ''}${analysisSection ? `\n${analysisSection}\n` : ''}

핵심 워크플로우 1개를 아래 JSON 형식으로만 반환하세요. 마크다운 없이 순수 JSON만 출력하세요.

노드 타입:
- "start": 시작점 (1개)
- "end": 종료점 (1~3개)
- "action": 사용자 액션 — 동사로 시작
- "decision": 분기 판단 — 조건을 질문 형태로
- "system": 시스템 자동 처리

각 노드에 label(10자 이내)과 description(사용자/시스템이 실제로 하는 행동을 구체적으로, 40자 이내) 포함.
decision 노드 이후 엣지에만 label: "예" / "아니오" 표기.

{
  "title": "워크플로우 제목",
  "description": "핵심 시나리오 한 문장",
  "nodes": [
    {
      "id": "n1",
      "type": "start",
      "label": "시작",
      "description": "담당자가 ERP에 로그인한다"
    },
    {
      "id": "n2",
      "type": "action",
      "label": "재고 확인",
      "description": "오늘 출하할 품목의 재고 수량을 확인한다"
    },
    {
      "id": "n3",
      "type": "decision",
      "label": "재고 충분?",
      "description": "출하 요청량 대비 현재 재고가 충분한지 판단"
    }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2" },
    { "id": "e2", "source": "n2", "target": "n3" },
    { "id": "e3", "source": "n3", "target": "n4", "label": "예" },
    { "id": "e4", "source": "n3", "target": "n7", "label": "아니오" }
  ]
}

노드 10~16개, 엣지 9~18개. 실제 시나리오에 맞게 자연스럽게 구성하세요.`

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder()
      const send = (data: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))

      const proc = spawn('claude', ['-p', prompt], {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let accumulated = ''
      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        accumulated += text
        send({ type: 'text', text })
      })
      proc.stderr.on('data', (chunk: Buffer) => {
        const msg = chunk.toString().trim()
        if (msg) send({ type: 'text', text: `▸ ${msg}\n` })
      })
      proc.on('close', (code: number) => {
        try {
          const cleaned = accumulated.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          const parsed = JSON.parse(cleaned)
          if (!fs.existsSync(HARNESS)) fs.mkdirSync(HARNESS, { recursive: true })
          fs.writeFileSync(WORKFLOW_FILE, JSON.stringify(parsed, null, 2), 'utf-8')
          send({ type: 'done', code, workflow: parsed })
        } catch {
          send({ type: 'done', code, error: 'JSON 파싱 실패' })
        }
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
