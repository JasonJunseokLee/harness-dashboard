import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { getContextDir, getHarnessDir } from '@/app/lib/project-path'

export const runtime = 'nodejs'

// context 폴더 파일 읽기
function loadContext(): string {
  const CONTEXT_DIR = getContextDir()
  if (!fs.existsSync(CONTEXT_DIR)) return ''
  const files = fs.readdirSync(CONTEXT_DIR).filter(f => !f.startsWith('.'))
  if (!files.length) return ''
  return files.map(f => {
    const content = fs.readFileSync(path.join(CONTEXT_DIR, f), 'utf-8')
    return `=== ${f} ===\n${content}`
  }).join('\n\n')
}

// 분석 리포트 → 프롬프트 삽입용 텍스트
function loadAnalysisSection(): string {
  const HARNESS_DIR = getHarnessDir()
  const ANALYSIS_FILE = path.join(HARNESS_DIR, 'context-analysis.json')
  if (!fs.existsSync(ANALYSIS_FILE)) return ''
  try {
    const a = JSON.parse(fs.readFileSync(ANALYSIS_FILE, 'utf-8'))
    return `[컨텍스트 분석 리포트 — 아래 인사이트를 반드시 PRD에 반영하세요]
요약: ${a.summary ?? ''}
사용자 문제: ${(a.userPainPoints ?? []).join(' / ')}
시장 인사이트: ${(a.marketInsights ?? []).join(' / ')}
핵심 데이터: ${(a.keyData ?? []).join(' / ')}
도출 요구사항: ${(a.requirements ?? []).join(' / ')}
기회 요인: ${(a.opportunities ?? []).join(' / ')}`
  } catch { return '' }
}

// GET: 저장된 PRD 반환 (?prev=true 이면 이전 버전)
export async function GET(req: NextRequest) {
  const HARNESS_DIR = getHarnessDir()
  const PRD_FILE = path.join(HARNESS_DIR, 'prd.json')
  const PRD_PREV_FILE = path.join(HARNESS_DIR, 'prd.prev.json')
  const isPrev = req.nextUrl.searchParams.get('prev') === 'true'
  const file = isPrev ? PRD_PREV_FILE : PRD_FILE
  if (!fs.existsSync(file)) return NextResponse.json({ exists: false })
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
  return NextResponse.json({ exists: true, data })
}

// PUT: PRD 직접 저장 (편집 후 덮어쓰기)
export async function PUT(req: NextRequest) {
  const HARNESS_DIR = getHarnessDir()
  const PRD_FILE = path.join(HARNESS_DIR, 'prd.json')
  const data = await req.json()
  if (!fs.existsSync(HARNESS_DIR)) fs.mkdirSync(HARNESS_DIR, { recursive: true })
  fs.writeFileSync(PRD_FILE, JSON.stringify(data, null, 2), 'utf-8')
  return NextResponse.json({ success: true })
}

// POST: PRD 생성 (SSE 스트리밍)
export async function POST(req: NextRequest) {
  const HARNESS_DIR = getHarnessDir()
  const PROJECT_FILE = path.join(HARNESS_DIR, 'project.json')
  const PRD_FILE = path.join(HARNESS_DIR, 'prd.json')
  const PRD_PREV_FILE = path.join(HARNESS_DIR, 'prd.prev.json')

  const body = await req.json().catch(() => ({}))
  const instruction: string = body.instruction ?? ''

  // 온보딩 데이터 필요
  if (!fs.existsSync(PROJECT_FILE)) {
    return new Response(JSON.stringify({ error: '온보딩을 먼저 완료해주세요' }), { status: 400 })
  }

  // 기존 PRD 백업 (이전 버전으로 보관)
  if (fs.existsSync(PRD_FILE)) {
    fs.copyFileSync(PRD_FILE, PRD_PREV_FILE)
  }

  const project = JSON.parse(fs.readFileSync(PROJECT_FILE, 'utf-8'))
  const contextText = loadContext()
  const analysisSection = loadAnalysisSection()

  // Q&A 텍스트로 변환
  const qaText = (project.questions ?? []).map((q: { question: string; id: string }, i: number) => {
    const answer = project.answers?.[q.id]
    const answerStr = Array.isArray(answer) ? answer.join(', ') : (answer ?? '미응답')
    return `Q${i + 1}. ${q.question}\n답변: ${answerStr}`
  }).join('\n\n')

  // 사용자 추가 지시사항
  const instructionSection = instruction.trim()
    ? `\n[사용자 추가 지시사항 — 최우선으로 반영하세요]\n${instruction.trim()}\n`
    : ''

  // PRD 생성 프롬프트
  const prompt = `당신은 시니어 프로덕트 매니저입니다. 아래 프로젝트 정보를 바탕으로 완성도 높은 PRD를 작성하세요.${instructionSection}

[프로젝트 설명]
${project.description}

[온보딩 Q&A]
${qaText}

${analysisSection ? `${analysisSection}\n` : ''}${contextText ? `[원본 참고 자료]\n${contextText}\n` : ''}

아래 JSON 형식으로만 응답하세요. 마크다운 코드블록, 설명 없이 순수 JSON만 출력하세요.

{
  "overview": {
    "oneLiner": "제품을 한 줄로 정의. 누구를 위해, 어떤 문제를, 어떻게 해결하는지 포함 (2-3문장)",
    "problem": "사용자가 겪는 구체적인 고통점과 현재 상황 (3-5문장)",
    "solution": "제품이 제공하는 해결책과 핵심 가치 (3-5문장)",
    "differentiation": "기존 솔루션 대비 차별화 포인트 (3-5문장)"
  },
  "target": {
    "users": "타겟 사용자 프로필과 특성 (3-5문장)",
    "scenario": "타겟 사용자의 하루 사용 시나리오 (7-10문장, 스토리텔링 형식으로 생동감 있게)"
  },
  "success": {
    "kpis": [
      "구체적 수치가 포함된 KPI 1",
      "구체적 수치가 포함된 KPI 2",
      "구체적 수치가 포함된 KPI 3",
      "구체적 수치가 포함된 KPI 4",
      "구체적 수치가 포함된 KPI 5"
    ],
    "risks": [
      "리스크 1: 내용 및 영향",
      "리스크 2: 내용 및 영향",
      "리스크 3: 내용 및 영향"
    ]
  },
  "attributes": {
    "roles": ["사용자 역할1", "사용자 역할2"],
    "devices": ["기기/환경1"]
  }
}`

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
        // 생성 완료 후 JSON 파싱 & 저장
        try {
          const cleaned = accumulated
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim()
          const parsed = JSON.parse(cleaned)

          if (!fs.existsSync(HARNESS_DIR)) fs.mkdirSync(HARNESS_DIR, { recursive: true })
          fs.writeFileSync(PRD_FILE, JSON.stringify(parsed, null, 2), 'utf-8')

          send({ type: 'done', code, prd: parsed })
        } catch {
          send({ type: 'done', code, error: '파싱 실패 — 원문을 확인하세요' })
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
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
