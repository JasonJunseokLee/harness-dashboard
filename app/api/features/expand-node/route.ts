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
    FEATURES_FILE: path.join(HARNESS, 'features.json'),
    FEATURES_PREV_FILE: path.join(HARNESS, 'features.prev.json'),
  }
}

// ─── 타입 ─────────────────────────────────────────────────────
type NodeType = 'root' | 'category' | 'feature' | 'subfeature'

interface TreeNode {
  id: string
  type: NodeType
  label: string
  parentId: string | null
  description?: string
  // category 전용
  color?: string
  // feature 전용
  priority?: 'high' | 'medium' | 'low'
  roles?: string[]
}

interface FeaturesFile {
  productName: string
  treeNodes: TreeNode[]
}

// ─── 유틸: 자식 타입 결정 ────────────────────────────────────
// root → category, category → feature, feature → subfeature
function getChildType(parentType: NodeType): NodeType | null {
  if (parentType === 'root') return 'category'
  if (parentType === 'category') return 'feature'
  if (parentType === 'feature') return 'subfeature'
  if (parentType === 'subfeature') return 'subfeature' // 무한 중첩 허용
  return null
}

// ─── 유틸: ID 접두사 결정 ────────────────────────────────────
// category=cat, feature=f, subfeature=sf
function getIdPrefix(type: NodeType): string {
  if (type === 'category') return 'cat'
  if (type === 'feature') return 'f'
  if (type === 'subfeature') return 'sf'
  return 'n'
}

// 기존 트리에서 같은 접두사를 쓰는 노드들의 최대 번호를 찾아 다음 시작 번호 반환
// 예: 기존에 cat1, cat2, cat3 이 있으면 4 반환
function nextIdNumber(treeNodes: TreeNode[], prefix: string): number {
  // 정확히 "prefix + 숫자" 형태만 매칭 (sf와 f의 충돌 방지: ^f\d+$)
  const re = new RegExp(`^${prefix}(\\d+)$`)
  let max = 0
  for (const n of treeNodes) {
    const m = re.exec(n.id)
    if (m) {
      const num = parseInt(m[1], 10)
      if (num > max) max = num
    }
  }
  return max + 1
}

// ─── 유틸: 카테고리 색상 풀 ───────────────────────────────────
const CATEGORY_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4']

// ─── 유틸: 동일 부모의 형제 라벨 (중복 방지 컨텍스트) ────────
function siblingLabels(treeNodes: TreeNode[], parentId: string): string[] {
  return treeNodes.filter(n => n.parentId === parentId).map(n => n.label)
}

// ─── 유틸: 프롬프트 생성 ──────────────────────────────────────
function buildPrompt(args: {
  productName: string
  parent: TreeNode
  childType: NodeType
  siblings: string[]
  allCategories: string[]
  instruction: string
}): string {
  const { productName, parent, childType, siblings, allCategories, instruction } = args

  // 자식 타입별 설명 차이
  const typeGuide =
    childType === 'category'
      ? '카테고리(category)는 기능들의 그룹입니다. label 12자 이내, description 30자 이내.'
      : childType === 'feature'
      ? '기능(feature)은 사용자가 실제로 사용하는 단위 기능입니다. label 15자 이내, description 40자 이내. priority(high/medium/low)와 roles(사용자 역할 배열)을 포함하세요.'
      : '하위 기능(subfeature)은 feature의 세부 동작/설정입니다. label 12자 이내, description 35자 이내.'

  const instructionSection = instruction.trim()
    ? `\n[사용자 추가 지시사항 — 최우선 반영]\n${instruction.trim()}\n`
    : ''

  const siblingsSection = siblings.length
    ? `\n[이미 존재하는 형제 항목 — 중복 금지]\n${siblings.map(s => `- ${s}`).join('\n')}\n`
    : ''

  const categoriesSection = allCategories.length
    ? `\n[전체 카테고리 컨텍스트 — 다른 카테고리와 역할 중복 금지]\n${allCategories.map(c => `- ${c}`).join('\n')}\n`
    : ''

  // feature 타입은 priority/roles 필드 포함 예시
  const exampleNode =
    childType === 'feature'
      ? `{ "type": "feature", "label": "기능명", "description": "기능 설명", "priority": "high", "roles": ["사용자 역할"] }`
      : childType === 'subfeature'
      ? `{ "type": "subfeature", "label": "하위기능명", "description": "하위기능 설명" }`
      : `{ "type": "category", "label": "카테고리명", "description": "카테고리 설명" }`

  return `당신은 시니어 프로덕트 매니저입니다. 아래 [부모 항목] 아래에 들어갈 자식 항목을 3~5개 추가하세요.${instructionSection}

[제품]
${productName}

[부모 항목 — 확장 대상]
타입: ${parent.type}
이름: ${parent.label}
설명: ${parent.description ?? ''}
${siblingsSection}${categoriesSection}
[가이드]
${typeGuide}

규칙:
- 정확히 3~5개의 새 자식 항목을 생성
- 부모 항목의 목적과 직접 연결되어야 함
- 형제 항목과 의미가 겹치지 않아야 함
- id는 절대 직접 부여하지 마세요 (서버에서 부여합니다)

아래 JSON 형식만 출력하세요. 마크다운 코드블록, 설명, 주석 없이 순수 JSON만:

{
  "newNodes": [
    ${exampleNode}
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

// ─── POST: 자식 노드 자동 생성 ───────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const nodeId: string = body.nodeId
  const instruction: string = body.instruction ?? ''

  const { HARNESS, FEATURES_FILE, FEATURES_PREV_FILE } = getPaths()

  // 사전 검증
  if (!nodeId) {
    return new Response(JSON.stringify({ error: 'nodeId가 필요합니다' }), { status: 400 })
  }
  if (!fs.existsSync(FEATURES_FILE)) {
    return new Response(JSON.stringify({ error: '기능 명세를 먼저 생성해주세요' }), { status: 400 })
  }

  const features: FeaturesFile = JSON.parse(fs.readFileSync(FEATURES_FILE, 'utf-8'))
  const treeNodes = features.treeNodes ?? []
  const parent = treeNodes.find(n => n.id === nodeId)

  if (!parent) {
    return new Response(JSON.stringify({ error: `노드를 찾을 수 없습니다: ${nodeId}` }), {
      status: 404,
    })
  }

  const childType = getChildType(parent.type)
  if (!childType) {
    return new Response(
      JSON.stringify({ error: 'subfeature 노드는 더 이상 확장할 수 없습니다' }),
      { status: 400 }
    )
  }

  // 프롬프트 컨텍스트 수집
  const allCategories = treeNodes.filter(n => n.type === 'category').map(n => n.label)
  const siblings = siblingLabels(treeNodes, parent.id)
  const productName = features.productName ?? '서비스'

  const prompt = buildPrompt({
    productName,
    parent,
    childType,
    siblings,
    allCategories,
    instruction,
  })

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
        const parsed = JSON.parse(cleaned) as { newNodes: Partial<TreeNode>[] }

        if (!Array.isArray(parsed.newNodes) || parsed.newNodes.length === 0) {
          throw new Error('newNodes 배열이 비어있습니다')
        }

        // 서버에서 ID 부여 (충돌 방지)
        const prefix = getIdPrefix(childType)
        let nextNum = nextIdNumber(treeNodes, prefix)

        const enrichedNodes: TreeNode[] = parsed.newNodes.map((n, i) => {
          const id = `${prefix}${nextNum++}`
          const node: TreeNode = {
            id,
            type: childType,
            label: String(n.label ?? '제목 없음').slice(0, 30),
            parentId: parent.id,
            description: String(n.description ?? '').slice(0, 100),
          }
          // category 전용 필드: color (없으면 색상 풀에서 순환 배정)
          if (childType === 'category') {
            const colorIdx = (allCategories.length + i) % CATEGORY_COLORS.length
            node.color = n.color ?? CATEGORY_COLORS[colorIdx]
          }
          // feature 전용 필드: priority, roles
          if (childType === 'feature') {
            node.priority = (n.priority as 'high' | 'medium' | 'low') ?? 'medium'
            node.roles = Array.isArray(n.roles) ? n.roles : []
          }
          return node
        })

        // 기존 트리에 병합 (push)
        const updatedTree = [...treeNodes, ...enrichedNodes]
        const updatedFile: FeaturesFile = { ...features, treeNodes: updatedTree }

        // 백업 후 저장
        if (!fs.existsSync(HARNESS)) fs.mkdirSync(HARNESS, { recursive: true })
        fs.copyFileSync(FEATURES_FILE, FEATURES_PREV_FILE)
        fs.writeFileSync(FEATURES_FILE, JSON.stringify(updatedFile, null, 2), 'utf-8')

        send({ type: 'done', code, newNodes: enrichedNodes, parentId: parent.id })
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
