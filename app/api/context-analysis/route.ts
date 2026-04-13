import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

export const runtime = 'nodejs'

const HARNESS = path.join(process.cwd(), '.harness')
const CONTEXT_DIR = path.join(process.cwd(), 'context')
const ANALYSIS_FILE = path.join(HARNESS, 'context-analysis.json')

// GET: 저장된 분석 리포트 반환
export async function GET() {
  if (!fs.existsSync(ANALYSIS_FILE)) return NextResponse.json({ exists: false })
  const data = JSON.parse(fs.readFileSync(ANALYSIS_FILE, 'utf-8'))
  return NextResponse.json({ exists: true, data })
}

// POST: 컨텍스트 파일 분석 (SSE 스트리밍)
export async function POST() {
  // 컨텍스트 디렉토리 확인
  if (!fs.existsSync(CONTEXT_DIR)) {
    return NextResponse.json({ error: '컨텍스트 파일이 없습니다' }, { status: 400 })
  }

  // 텍스트 파일만 허용 (PDF·바이너리 제외)
  const TEXT_EXTS = ['.txt', '.md', '.json', '.csv']
  const files = fs.readdirSync(CONTEXT_DIR)
    .filter((f) => !f.startsWith('.') && TEXT_EXTS.includes(path.extname(f).toLowerCase()))
  if (files.length === 0) {
    return NextResponse.json({ error: '분석 가능한 텍스트 파일이 없습니다 (.txt .md .json .csv만 지원)' }, { status: 400 })
  }

  // 모든 컨텍스트 파일 읽기 (null byte 제거)
  const contextContent = files
    .map((f) => {
      try {
        const raw = fs.readFileSync(path.join(CONTEXT_DIR, f), 'utf-8')
        const content = raw.replace(/\0/g, '')
        return `=== ${f} ===\n${content}`
      } catch {
        return `=== ${f} === (읽기 실패)`
      }
    })
    .join('\n\n')

  const prompt = `당신은 전문 비즈니스 분석가입니다. 아래 업로드된 자료를 분석하여 구조화된 인사이트 리포트를 JSON으로 작성하세요.

[업로드 자료 — ${files.length}개 파일]
${contextContent}

규칙:
- 자료에 실제로 있는 내용만 추출 (추측/가정 금지)
- 구체적인 수치/사실은 반드시 포함
- 각 항목은 1~2문장으로 간결하게
- 한국어로 작성

아래 JSON만 출력하세요. 마크다운 없이 순수 JSON:

{
  "summary": "자료 전체 요약 (3~5문장, 핵심 내용 위주)",
  "userPainPoints": ["사용자가 겪는 문제점·불편사항 (자료에서 직접 도출)"],
  "marketInsights": ["시장·경쟁·트렌드 관련 인사이트"],
  "keyData": ["중요 수치, 통계, 구체적 사실"],
  "requirements": ["자료에서 도출되는 기능·서비스 요구사항"],
  "opportunities": ["개선 기회, 차별화 포인트, 놓친 영역"]
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
        if (msg) send({ type: 'text', text: `▸ ${msg}\n` })
      })
      proc.on('close', (code: number) => {
        try {
          const cleaned = accumulated
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim()
          const parsed = JSON.parse(cleaned)
          if (!fs.existsSync(HARNESS)) fs.mkdirSync(HARNESS, { recursive: true })
          fs.writeFileSync(ANALYSIS_FILE, JSON.stringify(parsed, null, 2), 'utf-8')
          send({ type: 'done', code, analysis: parsed })
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
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
