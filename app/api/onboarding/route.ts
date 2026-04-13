import { NextRequest } from 'next/server'
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

// claude -p 를 SSE로 스트리밍 실행
function runClaudeSSE(prompt: string, controller: ReadableStreamDefaultController) {
  const enc = new TextEncoder()
  const send = (data: object) =>
    controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))

  const proc = spawn('claude', ['-p', prompt], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  proc.stdout.on('data', (chunk: Buffer) => send({ type: 'text', text: chunk.toString() }))
  proc.stderr.on('data', (chunk: Buffer) => {
    const msg = chunk.toString().trim()
    if (msg) send({ type: 'error', text: msg })
  })
  proc.on('close', (code: number) => {
    send({ type: 'done', code })
    controller.close()
  })
  proc.on('error', (err: Error) => {
    send({ type: 'error', text: err.message })
    controller.close()
  })
}

// POST: action에 따라 다른 프롬프트 실행
// action = "generate_questions" | "save_answers"
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === 'generate_questions') {
    // 프로젝트 설명 기반으로 동적 질문 6개 생성
    const { description } = body
    const contextText = loadContext()

    const prompt = `당신은 프로젝트 기획 전문가입니다.
사용자가 만들려는 프로젝트에 대해 핵심적인 질문 6개를 생성하세요.

${contextText ? `[참고 컨텍스트]\n${contextText}\n\n` : ''}[프로젝트 설명]
${description}

아래 JSON 형식으로만 응답하세요. 다른 설명이나 마크다운 없이 JSON만 출력하세요.
질문은 프로젝트 타입에 맞게 유동적으로 구성하되, 반드시 6개여야 합니다.

{
  "questions": [
    {
      "id": "q1",
      "question": "질문 내용",
      "type": "single",
      "options": ["옵션1", "옵션2", "옵션3"]
    },
    {
      "id": "q2",
      "question": "질문 내용",
      "type": "multiple",
      "options": ["옵션1", "옵션2", "옵션3", "옵션4"]
    }
  ]
}

type은 "single"(단일 선택) 또는 "multiple"(복수 선택)만 사용합니다.
options는 3~5개로 구성합니다.`

    const stream = new ReadableStream({ start: (ctrl) => runClaudeSSE(prompt, ctrl) })
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    })
  }

  if (action === 'save_answers') {
    // 온보딩 답변을 .harness/project.json 에 저장
    const { description, questions, answers, techStack } = body
    const HARNESS_DIR = getHarnessDir()

    if (!fs.existsSync(HARNESS_DIR)) fs.mkdirSync(HARNESS_DIR, { recursive: true })

    const projectData = {
      createdAt: new Date().toISOString(),
      description,
      questions,
      answers,
      techStack: techStack ?? {}, // 기술 스택 저장
      status: 'onboarding_done',
    }

    fs.writeFileSync(
      path.join(HARNESS_DIR, 'project.json'),
      JSON.stringify(projectData, null, 2),
      'utf-8'
    )

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ error: '알 수 없는 action' }), { status: 400 })
}
