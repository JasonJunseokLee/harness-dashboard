import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { getHarnessDir } from '@/app/lib/project-path'

export const runtime = 'nodejs'

// ─── POST: 기능명세서 기반 유저 흐름 제안 (SSE) ─────────────────
export async function POST() {
  const HARNESS = getHarnessDir()
  const PRD_FILE = path.join(HARNESS, 'prd.json')
  const FEATURES_FILE = path.join(HARNESS, 'features.json')

  if (!fs.existsSync(PRD_FILE)) {
    return NextResponse.json({ error: 'PRD를 먼저 생성해주세요' }, { status: 400 })
  }

  const prd = JSON.parse(fs.readFileSync(PRD_FILE, 'utf-8'))
  const features = fs.existsSync(FEATURES_FILE)
    ? JSON.parse(fs.readFileSync(FEATURES_FILE, 'utf-8'))
    : null

  // 기능 트리 전체 구성 (카테고리별)
  let featureTree = ''
  if (features?.treeNodes) {
    const cats = features.treeNodes.filter((n: { type: string }) => n.type === 'category')
    const feats = features.treeNodes.filter((n: { type: string }) => n.type === 'feature')
    featureTree = cats
      .map((cat: { id: string; label: string }) => {
        const catFeats = feats.filter((f: { parentId: string }) => f.parentId === cat.id)
        const featLines = catFeats.map((f: { label: string }) => `  - ${f.label}`).join('\n')
        return `[${cat.label}]\n${featLines}`
      })
      .join('\n\n')
  }

  const prompt = `[중요] 파일 읽기, 파일 쓰기, 터미널 실행 등 어떤 도구도 사용하지 마세요. 오직 JSON만 stdout으로 출력하세요.
[중요] 백틱, 마크다운 코드블록, 설명 텍스트 모두 금지. 순수 JSON 하나만 출력하세요.

당신은 UX 전략가입니다. 아래 서비스의 기능명세서를 분석하여 핵심 유저 워크플로우 목록을 제안하세요.

[서비스]
${prd.overview?.oneLiner ?? ''}

[타겟 사용자]
${prd.target?.users ?? ''}

[기능명세서]
${featureTree || '(기능 없음)'}

규칙:
- 실제 유저가 목적을 달성하기 위해 거치는 대표 흐름 4~6개 제안
- 각 흐름은 서로 다른 목적/진입점 (중복 금지)
- 기능명세서의 기능들을 골고루 커버할 것
- 흐름 제목은 "동사+목적어" 형태로 (예: "상품 주문하기", "리뷰 작성하기")

아래 JSON만 출력:

{
  "flows": [
    { "title": "흐름 제목", "description": "이 흐름이 커버하는 시나리오 한 문장 (40자 이내)" }
  ]
}`

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder()
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

      let accumulated = ''
      proc.stdout.on('data', (chunk: Buffer) => { accumulated += chunk.toString() })
      proc.stderr.on('data', (chunk: Buffer) => {
        const msg = chunk.toString().trim()
        if (msg) send({ type: 'text', text: `▸ ${msg}\n` })
      })
      proc.on('close', () => {
        try {
          const cleaned = accumulated.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          const parsed = JSON.parse(cleaned)
          send({ type: 'done', flows: parsed.flows ?? [] })
        } catch {
          send({ type: 'done', error: 'JSON 파싱 실패', flows: [] })
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
