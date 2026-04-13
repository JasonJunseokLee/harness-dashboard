import { NextRequest } from 'next/server'
import { spawn } from 'child_process'
import { AIVersionManager } from '@/app/lib/ai-version-manager'

export const runtime = 'nodejs'

const PHASE_DIR = '.harness/ai-results/claude-md'

// ─── POST: claude -p로 CLAUDE.md 수정 요청 (SSE 스트리밍) ──────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const instruction: string = body.instruction ?? ''
  const context: string = body.context ?? ''

  if (!instruction.trim()) {
    return new Response(
      JSON.stringify({ error: '수정 지시사항을 입력해주세요.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // 수정 프롬프트 구성
  const prompt = `[중요] 파일 읽기, 파일 쓰기, 터미널 실행 등 어떤 도구도 사용하지 마세요. 오직 마크다운 텍스트만 stdout으로 출력하세요.

당신은 시니어 소프트웨어 엔지니어이자 AI 협업 전문가입니다.

아래는 기존 CLAUDE.md 파일 내용입니다:

━━━ 현재 CLAUDE.md ━━━
${context}
━━━━━━━━━━━━━━━━━━━

사용자의 수정 요청:
${instruction}

위 요청에 따라 CLAUDE.md 전체를 수정하여 출력하세요.
- 기존 구조를 유지하면서 요청된 부분만 변경합니다
- 변경하지 않는 부분도 그대로 포함해야 합니다 (전체 파일 출력)
- 마크다운 형식으로만 응답하세요.`

  const enc = new TextEncoder()
  let fullContent = ''

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))

      const proc = spawn('claude', ['-p', prompt], {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        fullContent += text
        send({ type: 'text', text })
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        const msg = chunk.toString().trim()
        if (msg) send({ type: 'error', text: msg })
      })

      proc.on('close', async () => {
        try {
          // 버전으로 저장
          const manager = new AIVersionManager(PHASE_DIR)
          const { version, timestamp } = await manager.saveVersion(
            fullContent,
            'user_refinement',
            instruction
          )

          send({
            type: 'done',
            newVersion: version,
            timestamp,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : '버전 저장 실패'
          send({ type: 'error', text: message })
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
