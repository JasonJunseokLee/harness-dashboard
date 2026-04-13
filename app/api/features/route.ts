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
    return `[컨텍스트 분석 리포트 — 아래 인사이트를 기능 명세에 반영하세요]
요약: ${a.summary ?? ''}
사용자 문제: ${(a.userPainPoints ?? []).join(' / ')}
도출 요구사항: ${(a.requirements ?? []).join(' / ')}
기회 요인: ${(a.opportunities ?? []).join(' / ')}`
  } catch { return '' }
}

// GET: 저장된 기능 명세서 반환 (?prev=true 이면 이전 버전)
export async function GET(req: NextRequest) {
  const HARNESS = getHarnessDir()
  const FEATURES_FILE = path.join(HARNESS, 'features.json')
  const FEATURES_PREV_FILE = path.join(HARNESS, 'features.prev.json')
  const isPrev = req.nextUrl.searchParams.get('prev') === 'true'
  const file = isPrev ? FEATURES_PREV_FILE : FEATURES_FILE
  if (!fs.existsSync(file)) return NextResponse.json({ exists: false })
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
  return NextResponse.json({ exists: true, data })
}

// PUT: 편집된 트리 저장
export async function PUT(req: NextRequest) {
  const HARNESS = getHarnessDir()
  const FEATURES_FILE = path.join(HARNESS, 'features.json')
  const body = await req.json()
  if (!fs.existsSync(HARNESS)) fs.mkdirSync(HARNESS, { recursive: true })
  fs.writeFileSync(FEATURES_FILE, JSON.stringify(body, null, 2), 'utf-8')
  return NextResponse.json({ success: true })
}

// POST: PRD 기반 초기 트리 생성 (SSE 스트리밍)
export async function POST(req: NextRequest) {
  const HARNESS = getHarnessDir()
  const PRD_FILE = path.join(HARNESS, 'prd.json')
  const FEATURES_FILE = path.join(HARNESS, 'features.json')
  const FEATURES_PREV_FILE = path.join(HARNESS, 'features.prev.json')
  const PROJECT_FILE = path.join(HARNESS, 'project.json')

  const body = await req.json().catch(() => ({}))
  const instruction: string = body.instruction ?? ''

  if (!fs.existsSync(PRD_FILE)) {
    return new Response(JSON.stringify({ error: 'PRD를 먼저 생성해주세요' }), { status: 400 })
  }

  // 기존 기능 명세 백업
  if (fs.existsSync(FEATURES_FILE)) {
    fs.copyFileSync(FEATURES_FILE, FEATURES_PREV_FILE)
  }

  const prd = JSON.parse(fs.readFileSync(PRD_FILE, 'utf-8'))
  const project = fs.existsSync(PROJECT_FILE)
    ? JSON.parse(fs.readFileSync(PROJECT_FILE, 'utf-8'))
    : {}
  const analysisSection = loadAnalysisSection()

  const roles = prd.attributes?.roles ?? []
  const productName = (project.description ?? '서비스').slice(0, 30)

  const instructionSection = instruction.trim()
    ? `\n[사용자 추가 지시사항 — 최우선으로 반영하세요]\n${instruction.trim()}\n`
    : ''

  const prompt = `당신은 시니어 프로덕트 매니저입니다. 아래 PRD를 바탕으로 기능 명세서를 트리 구조 JSON으로 작성하세요.${instructionSection}

[PRD 요약]
한 줄 정의: ${prd.overview?.oneLiner ?? ''}
사용자 문제: ${prd.overview?.problem ?? ''}
해결 방식: ${prd.overview?.solution ?? ''}
사용자 역할: ${roles.join(', ')}

${analysisSection ? `${analysisSection}\n` : ''}

규칙:
- 트리는 root → category → feature → subfeature 4단계 구조
- category: 4~6개
- feature: 카테고리당 3~5개
- subfeature: 주요 feature 중 2~3개만 1~3개씩 추가 (전부 필요 없음)
- id는 "root", "cat1", "cat2", "f1", "f2", "sf1" 형식
- parentId로 부모 연결

아래 JSON만 출력하세요. 마크다운 없이 순수 JSON:

{
  "productName": "${productName}",
  "treeNodes": [
    {"id": "root", "type": "root", "label": "${productName}", "parentId": null, "description": ""},
    {"id": "cat1", "type": "category", "label": "카테고리명", "parentId": "root", "color": "#3b82f6", "description": "카테고리 설명"},
    {"id": "f1", "type": "feature", "label": "기능명(15자 이내)", "parentId": "cat1", "priority": "high", "description": "기능 설명(40자 이내)", "roles": ["역할"]},
    {"id": "sf1", "type": "subfeature", "label": "하위기능명", "parentId": "f1", "description": "하위기능 설명"}
  ]
}

category color 배정:
"#3b82f6"(파랑), "#8b5cf6"(보라), "#10b981"(초록), "#f59e0b"(노랑), "#ef4444"(빨강), "#06b6d4"(하늘)`

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
        if (msg) send({ type: 'error', text: msg })
      })
      proc.on('close', (code: number) => {
        try {
          const cleaned = accumulated.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          const parsed = JSON.parse(cleaned)
          if (!fs.existsSync(HARNESS)) fs.mkdirSync(HARNESS, { recursive: true })
          fs.writeFileSync(FEATURES_FILE, JSON.stringify(parsed, null, 2), 'utf-8')
          send({ type: 'done', code, features: parsed })
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
