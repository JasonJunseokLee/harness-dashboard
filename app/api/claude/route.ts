import { NextRequest } from 'next/server'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

// Node.js 런타임 사용 (Edge 런타임은 child_process 미지원)
export const runtime = 'nodejs'

// context 폴더의 파일들을 읽어서 하나의 문자열로 합치는 함수
function loadContextFiles(): string {
  const contextDir = path.join(process.cwd(), 'context')
  if (!fs.existsSync(contextDir)) return ''

  const files = fs.readdirSync(contextDir).filter(f => !f.startsWith('.'))
  if (files.length === 0) return ''

  const contents = files.map(file => {
    const filePath = path.join(contextDir, file)
    const content = fs.readFileSync(filePath, 'utf-8')
    return `=== ${file} ===\n${content}`
  })

  return `\n\n[참고 컨텍스트 파일]\n${contents.join('\n\n')}`
}

export async function POST(req: NextRequest) {
  const { prompt, includeContext = false } = await req.json()

  if (!prompt) {
    return new Response(JSON.stringify({ error: 'prompt가 필요합니다' }), { status: 400 })
  }

  // 컨텍스트 파일 포함 여부에 따라 최종 프롬프트 구성
  const contextText = includeContext ? loadContextFiles() : ''
  const finalPrompt = contextText ? `${contextText}\n\n${prompt}` : prompt

  // SSE 스트림 생성
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder()

      // SSE 이벤트 전송 헬퍼
      const send = (data: object) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      // claude -p 로 비대화형 실행 (로컬 인증 그대로 사용)
      // stdin을 ignore로 설정해서 "no stdin data" 경고 제거
      const proc = spawn('claude', ['-p', finalPrompt], {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      proc.stdout.on('data', (chunk: Buffer) => {
        send({ type: 'text', text: chunk.toString() })
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        // 일부 모델 출력이 stderr로 오는 경우 대비
        const msg = chunk.toString()
        if (msg.trim()) send({ type: 'error', text: msg })
      })

      proc.on('close', (code: number) => {
        send({ type: 'done', code })
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
