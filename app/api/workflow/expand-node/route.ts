import { NextRequest } from 'next/server'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { getHarnessDir } from '@/app/lib/project-path'

// Node.js 런타임 강제 (Edge 런타임은 child_process 미지원)
export const runtime = 'nodejs'

// 파일 경로는 함수 호출 시점에 계산 (대상 프로젝트 경로가 런타임 변경될 수 있음)
function getPaths() {
  const HARNESS = getHarnessDir()
  return {
    HARNESS,
    WORKFLOW_FILE: path.join(HARNESS, 'workflow.json'),
    WORKFLOW_PREV_FILE: path.join(HARNESS, 'workflow.prev.json'),
  }
}

// ─── 타입 ─────────────────────────────────────────────────────
type WorkflowNodeType = 'start' | 'end' | 'action' | 'decision' | 'system'

interface WorkflowNode {
  id: string
  type: WorkflowNodeType
  label: string
  description: string
}

interface WorkflowEdge {
  id: string
  source: string
  target: string
  label?: string
}

interface WorkflowFile {
  title: string
  description: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

// ─── 유틸: ID 다음 번호 찾기 ─────────────────────────────────
// 기존 워크플로우의 "n1, n2, ..." 또는 "e1, e2, ..." 중 최대값+1 반환
function nextIdNumber(items: { id: string }[], prefix: string): number {
  const re = new RegExp(`^${prefix}(\\d+)$`)
  let max = 0
  for (const it of items) {
    const m = re.exec(it.id)
    if (m) {
      const num = parseInt(m[1], 10)
      if (num > max) max = num
    }
  }
  return max + 1
}

// ─── 유틸: 전체 워크플로우 텍스트 요약 (프롬프트 컨텍스트용) ─
function summarizeWorkflow(workflow: WorkflowFile, currentId: string): string {
  return workflow.nodes
    .map(n => {
      const marker = n.id === currentId ? ' ← [확장 대상]' : ''
      return `- ${n.id} (${n.type}) ${n.label}: ${n.description}${marker}`
    })
    .join('\n')
}

// ─── 유틸: 프롬프트 생성 ──────────────────────────────────────
function buildPrompt(args: {
  workflow: WorkflowFile
  currentNode: WorkflowNode
  instruction: string
}): string {
  const { workflow, currentNode, instruction } = args

  const instructionSection = instruction.trim()
    ? `\n[사용자 추가 지시사항 — 최우선 반영]\n${instruction.trim()}\n`
    : ''

  const summary = summarizeWorkflow(workflow, currentNode.id)

  return `당신은 UX 디자이너입니다. 아래 기존 워크플로우의 [확장 대상] 노드 직후에 자연스럽게 이어질 단계를 추가하세요.${instructionSection}

[워크플로우]
제목: ${workflow.title}
설명: ${workflow.description}

[전체 노드 — 흐름 파악용]
${summary}

[확장 대상]
id: ${currentNode.id}
타입: ${currentNode.type}
이름: ${currentNode.label}
설명: ${currentNode.description}

규칙:
- 새 노드 2~4개 추가
- 새 노드는 [확장 대상] 직후 자연스럽게 이어져야 함
- 기존 노드와 의미가 겹치지 않아야 함
- 노드 타입: action(사용자 액션, 동사로 시작) / decision(분기 판단, 질문 형태) / system(시스템 자동 처리) / end(종료) 중 선택
- 새 노드의 id는 "t1", "t2", "t3"... 같은 임시 id를 사용 (서버에서 실제 id로 치환)
- label은 10자 이내, description은 40자 이내
- 엣지의 source/target은 임시 id(t1...) 또는 기존 노드 id(n5 등) 사용 가능
- decision 노드에서 분기되는 엣지는 반드시 label에 "예" 또는 "아니오" 표기
- 첫 엣지는 [확장 대상]에서 새 노드로 향해야 함 (source: ${currentNode.id})

아래 JSON 형식만 출력하세요. 마크다운 코드블록, 설명, 주석 없이 순수 JSON만:

{
  "newNodes": [
    { "tempId": "t1", "type": "action", "label": "예시 액션", "description": "사용자가 무엇을 한다" }
  ],
  "newEdges": [
    { "source": "${currentNode.id}", "target": "t1" }
  ]
}`
}

// ─── 유틸: SSE 스트림 헬퍼 ────────────────────────────────────
function makeStream(handler: (send: (data: object) => void, finish: () => void) => void) {
  return new ReadableStream({
    start(controller) {
      const enc = new TextEncoder()
      const send = (data: object) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))
      }
      const finish = () => controller.close()
      handler(send, finish)
    },
  })
}

// ─── POST: 워크플로우 노드 확장 ───────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const nodeId: string = body.nodeId
  const instruction: string = body.instruction ?? ''

  const { HARNESS, WORKFLOW_FILE, WORKFLOW_PREV_FILE } = getPaths()

  // 사전 검증
  if (!nodeId) {
    return new Response(JSON.stringify({ error: 'nodeId가 필요합니다' }), { status: 400 })
  }
  if (!fs.existsSync(WORKFLOW_FILE)) {
    return new Response(JSON.stringify({ error: '워크플로우를 먼저 생성해주세요' }), {
      status: 400,
    })
  }

  const workflow: WorkflowFile = JSON.parse(fs.readFileSync(WORKFLOW_FILE, 'utf-8'))
  const nodes = workflow.nodes ?? []
  const edges = workflow.edges ?? []

  const currentNode = nodes.find(n => n.id === nodeId)
  if (!currentNode) {
    return new Response(JSON.stringify({ error: `노드를 찾을 수 없습니다: ${nodeId}` }), {
      status: 404,
    })
  }

  // end 노드는 더 이상 확장 불가
  if (currentNode.type === 'end') {
    return new Response(JSON.stringify({ error: 'end 노드는 확장할 수 없습니다' }), {
      status: 400,
    })
  }

  const prompt = buildPrompt({ workflow, currentNode, instruction })

  // SSE 스트림 시작
  const stream = makeStream((send, finish) => {
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
      if (msg) send({ type: 'error', text: msg })
    })

    proc.on('close', (code: number) => {
      try {
        // ```json 코드블록 제거
        const cleaned = accumulated.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const parsed = JSON.parse(cleaned) as {
          newNodes: Array<{ tempId: string; type: WorkflowNodeType; label: string; description: string }>
          newEdges: Array<{ source: string; target: string; label?: string }>
        }

        if (!Array.isArray(parsed.newNodes) || parsed.newNodes.length === 0) {
          throw new Error('newNodes 배열이 비어있습니다')
        }
        if (!Array.isArray(parsed.newEdges) || parsed.newEdges.length === 0) {
          throw new Error('newEdges 배열이 비어있습니다')
        }

        // 임시 id → 실제 id 매핑 테이블 생성
        let nextNodeNum = nextIdNumber(nodes, 'n')
        const tempIdToReal = new Map<string, string>()
        const enrichedNodes: WorkflowNode[] = parsed.newNodes.map(n => {
          const realId = `n${nextNodeNum++}`
          tempIdToReal.set(n.tempId, realId)
          return {
            id: realId,
            type: n.type,
            label: String(n.label ?? '').slice(0, 20),
            description: String(n.description ?? '').slice(0, 80),
          }
        })

        // 엣지 변환: tempId → realId 치환, 기존 id는 그대로 유지
        let nextEdgeNum = nextIdNumber(edges, 'e')
        const enrichedEdges: WorkflowEdge[] = parsed.newEdges.map(e => {
          const source = tempIdToReal.get(e.source) ?? e.source
          const target = tempIdToReal.get(e.target) ?? e.target
          const edge: WorkflowEdge = {
            id: `e${nextEdgeNum++}`,
            source,
            target,
          }
          if (e.label) edge.label = e.label
          return edge
        })

        // 기존 워크플로우에 병합
        const updatedWorkflow: WorkflowFile = {
          ...workflow,
          nodes: [...nodes, ...enrichedNodes],
          edges: [...edges, ...enrichedEdges],
        }

        // 백업 후 저장
        if (!fs.existsSync(HARNESS)) fs.mkdirSync(HARNESS, { recursive: true })
        fs.copyFileSync(WORKFLOW_FILE, WORKFLOW_PREV_FILE)
        fs.writeFileSync(WORKFLOW_FILE, JSON.stringify(updatedWorkflow, null, 2), 'utf-8')

        send({
          type: 'done',
          code,
          newNodes: enrichedNodes,
          newEdges: enrichedEdges,
          parentId: currentNode.id,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        send({ type: 'done', code, error: `JSON 파싱/병합 실패: ${msg}` })
      }
      finish()
    })

    proc.on('error', (err: Error) => {
      send({ type: 'error', text: err.message })
      finish()
    })
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
