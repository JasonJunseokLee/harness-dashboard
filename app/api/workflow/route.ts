import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { getHarnessDir } from '@/app/lib/project-path'

export const runtime = 'nodejs'

type FlowData = {
  id: string
  title: string
  description: string
  nodes: unknown[]
  edges: unknown[]
}

type WorkflowFile = { flows: FlowData[] }

// 파일 읽기 + 구버전(단일 흐름) 자동 마이그레이션
function readWorkflowFile(filePath: string): WorkflowFile | null {
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    if (raw.nodes && Array.isArray(raw.nodes) && !raw.flows) {
      // 구버전 단일 흐름 → 신규 멀티 흐름
      return { flows: [{ id: 'flow_legacy', ...raw }] }
    }
    return raw as WorkflowFile
  } catch { return null }
}

function writeWorkflowFile(filePath: string, data: WorkflowFile) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function loadAnalysisSection(): string {
  const HARNESS = getHarnessDir()
  const ANALYSIS_FILE = path.join(HARNESS, 'context-analysis.json')
  if (!fs.existsSync(ANALYSIS_FILE)) return ''
  try {
    const a = JSON.parse(fs.readFileSync(ANALYSIS_FILE, 'utf-8'))
    return `[컨텍스트 분석]\n사용자 문제: ${(a.userPainPoints ?? []).join(' / ')}\n도출 요구사항: ${(a.requirements ?? []).join(' / ')}`
  } catch { return '' }
}

// ─── GET: 전체 흐름 목록 반환 ──────────────────────────────────
export async function GET() {
  const HARNESS = getHarnessDir()
  const WORKFLOW_FILE = path.join(HARNESS, 'workflow.json')
  const data = readWorkflowFile(WORKFLOW_FILE)
  if (!data) return NextResponse.json({ exists: false, flows: [] })
  return NextResponse.json({ exists: true, flows: data.flows })
}

// ─── DELETE: 특정 흐름 삭제 ────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const HARNESS = getHarnessDir()
  const WORKFLOW_FILE = path.join(HARNESS, 'workflow.json')
  const flowId = req.nextUrl.searchParams.get('flowId')
  if (!flowId) return NextResponse.json({ error: 'flowId 필요' }, { status: 400 })
  const data = readWorkflowFile(WORKFLOW_FILE) ?? { flows: [] }
  data.flows = data.flows.filter(f => f.id !== flowId)
  if (!fs.existsSync(HARNESS)) fs.mkdirSync(HARNESS, { recursive: true })
  writeWorkflowFile(WORKFLOW_FILE, data)
  return NextResponse.json({ success: true })
}

// ─── PUT: 특정 흐름 업데이트 ───────────────────────────────────
export async function PUT(req: NextRequest) {
  const HARNESS = getHarnessDir()
  const WORKFLOW_FILE = path.join(HARNESS, 'workflow.json')
  const body = await req.json()
  const { flowId, data: flowData } = body
  if (!flowId || !flowData) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  if (!fs.existsSync(HARNESS)) fs.mkdirSync(HARNESS, { recursive: true })
  const file = readWorkflowFile(WORKFLOW_FILE) ?? { flows: [] }
  const idx = file.flows.findIndex(f => f.id === flowId)
  if (idx >= 0) { file.flows[idx] = { ...flowData, id: flowId } }
  else { file.flows.push({ ...flowData, id: flowId }) }
  writeWorkflowFile(WORKFLOW_FILE, file)
  return NextResponse.json({ success: true })
}

// ─── POST: 특정 흐름 생성 (SSE) ────────────────────────────────
export async function POST(req: NextRequest) {
  const HARNESS = getHarnessDir()
  const PRD_FILE = path.join(HARNESS, 'prd.json')
  const FEATURES_FILE = path.join(HARNESS, 'features.json')
  const WORKFLOW_FILE = path.join(HARNESS, 'workflow.json')

  const body = await req.json().catch(() => ({}))
  const flowId: string = body.flowId ?? `flow_${Date.now().toString(36)}`
  const flowTitle: string = body.title ?? '유저 워크플로우'
  const flowDesc: string = body.description ?? ''
  const instruction: string = body.instruction ?? ''

  if (!fs.existsSync(PRD_FILE)) {
    return new Response(JSON.stringify({ error: 'PRD를 먼저 생성해주세요' }), { status: 400 })
  }

  const prd = JSON.parse(fs.readFileSync(PRD_FILE, 'utf-8'))
  const features = fs.existsSync(FEATURES_FILE) ? JSON.parse(fs.readFileSync(FEATURES_FILE, 'utf-8')) : null

  let featureList = ''
  if (features?.treeNodes) {
    const cats = features.treeNodes.filter((n: { type: string }) => n.type === 'category')
    const feats = features.treeNodes.filter((n: { type: string }) => n.type === 'feature')
    featureList = feats
      .map((f: { label: string; parentId: string }) => {
        const cat = cats.find((c: { id: string; label: string }) => c.id === f.parentId)
        return cat ? `${cat.label} > ${f.label}` : f.label
      })
      .join('\n')
  }

  const analysisSection = loadAnalysisSection()
  const instructionSection = instruction.trim()
    ? `\n[사용자 추가 지시사항 — 최우선으로 반영하세요]\n${instruction.trim()}\n`
    : ''

  const prompt = `[중요] 파일 읽기, 파일 쓰기, 터미널 실행 등 어떤 도구도 사용하지 마세요. 오직 JSON만 stdout으로 출력하세요.
[중요] 백틱, 마크다운 코드블록, 설명 텍스트 모두 금지. 순수 JSON 하나만 출력하세요.

당신은 UX 디자이너입니다. 아래 정보를 바탕으로 지정된 유저 워크플로우를 작성하세요.${instructionSection}

[서비스]
${prd.overview?.oneLiner ?? ''}

[타겟 사용자]
${prd.target?.users ?? ''}

[사용 시나리오]
${prd.target?.scenario ?? ''}

${featureList ? `[주요 기능]\n${featureList}\n` : ''}${analysisSection ? `\n${analysisSection}\n` : ''}

[생성할 워크플로우]
제목: ${flowTitle}
시나리오: ${flowDesc}

이 워크플로우만을 위한 플로우차트를 아래 JSON 형식으로만 반환하세요.

노드 타입:
- "start": 시작점 (1개)
- "end": 종료점 (1~3개)
- "action": 사용자 액션 — 동사로 시작
- "decision": 분기 판단 — 조건을 질문 형태로
- "system": 시스템 자동 처리

각 노드: label(10자 이내), description(40자 이내) 필수.
decision 노드 이후 엣지에만 label: "예" / "아니오".

{
  "title": "${flowTitle}",
  "description": "${flowDesc}",
  "nodes": [
    { "id": "n1", "type": "start", "label": "시작", "description": "..." }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2" }
  ]
}

노드 10~16개, 엣지 9~18개.`

  const enc = new TextEncoder()
  let accumulated = ''

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch { /* closed */ }
      }
      const close = () => { try { controller.close() } catch { /* already closed */ } }

      const proc = spawn('claude', ['--print'], {
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      proc.stdin?.write(prompt)
      proc.stdin?.end()

      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        accumulated += text
        send({ type: 'text', text })
      })
      proc.stderr.on('data', (chunk: Buffer) => {
        const msg = chunk.toString().trim()
        if (msg) send({ type: 'text', text: `▸ ${msg}\n` })
      })
      proc.on('close', () => {
        if (!fs.existsSync(HARNESS)) fs.mkdirSync(HARNESS, { recursive: true })

        // raw 출력 항상 저장
        fs.writeFileSync(path.join(HARNESS, `workflow-${flowId}.raw.txt`), accumulated, 'utf-8')

        try {
          const cleaned = accumulated.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          const parsed = JSON.parse(cleaned)
          const file = readWorkflowFile(WORKFLOW_FILE) ?? { flows: [] }
          const flowWithId = { ...parsed, id: flowId }
          const idx = file.flows.findIndex(f => f.id === flowId)
          if (idx >= 0) { file.flows[idx] = flowWithId } else { file.flows.push(flowWithId) }
          writeWorkflowFile(WORKFLOW_FILE, file)
          send({ type: 'done', flowId, flow: flowWithId })
        } catch {
          send({ type: 'done', error: `JSON 파싱 실패 — workflow-${flowId}.raw.txt 를 확인하세요` })
        }
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
