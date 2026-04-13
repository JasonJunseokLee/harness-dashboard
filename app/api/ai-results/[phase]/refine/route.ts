import { NextRequest } from 'next/server'
import { spawn } from 'child_process'
import { AIVersionManager } from '@/app/lib/ai-version-manager'
import {
  isSupportedPhase,
  getPhaseDir,
  PHASE_FORMAT,
  PROMPT_TEMPLATES,
  sanitizeAndValidateJson,
} from '@/app/lib/ai-phase-config'

export const runtime = 'nodejs'

// ─────────────────────────────────────────────────────────────
// POST /api/ai-results/[phase]/refine
// - claude CLI 를 spawn 해서 현재 문서(context)를 수정 지시(instruction)에 맞춰 재작성
// - 출력은 SSE(Server-Sent Events) 스트림
// - format === 'json' 인 경우: 응답 수집 후 JSON 파싱 검증
//     성공 → 버전 저장 + { type: 'done', ..., parsed }
//     실패 → { type: 'error', text: '...' } + 버전 미저장
// - format === 'markdown' 인 경우: 그대로 버전 저장
// ─────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ phase: string }> }
) {
  // Next.js 15+ 의 params 는 비동기
  const { phase } = await params

  // phase 검증 (ai-phase-config 의 화이트리스트 기반)
  if (!isSupportedPhase(phase)) {
    return new Response(
      JSON.stringify({ error: `지원하지 않는 phase 입니다: ${phase}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // 요청 바디 파싱
  const body = await req.json().catch(() => ({}))
  const instruction: string = body.instruction ?? ''
  // 클라이언트가 넘긴 현재 문서 원본 (프롬프트에 삽입)
  const context: string = body.context ?? ''
  // 포맷은 phase 기준(서버 소스오브트루스)으로만 결정. 클라이언트 힌트는 무시.
  const format = PHASE_FORMAT[phase]

  // 지시사항이 비어있으면 에러
  if (!instruction.trim()) {
    return new Response(
      JSON.stringify({ error: '수정 지시사항을 입력해주세요.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // phase 별 프롬프트 템플릿 적용
  const prompt = PROMPT_TEMPLATES[phase](context, instruction)

  const enc = new TextEncoder()
  // stdout 전체를 누적해둠 (close 시점에 버전 저장/JSON 파싱에 사용)
  let fullContent = ''

  const stream = new ReadableStream({
    start(controller) {
      // SSE 한 줄 전송 헬퍼
      const send = (data: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))

      // claude CLI 를 -p 모드(프롬프트 모드)로 실행
      // stdout → 실시간 text 이벤트, stderr → error 이벤트
      const proc = spawn('claude', ['-p', prompt], {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      // 실시간 스트리밍: 모든 청크를 누적 + 클라이언트로 전달
      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        fullContent += text
        send({ type: 'text', text })
      })

      // stderr 는 경고/에러 로그
      proc.stderr.on('data', (chunk: Buffer) => {
        const msg = chunk.toString().trim()
        if (msg) send({ type: 'error', text: msg })
      })

      // 프로세스 종료 시 후처리 (버전 저장 + 완료 이벤트)
      proc.on('close', async () => {
        try {
          const manager = new AIVersionManager(getPhaseDir(phase))

          if (format === 'json') {
            // ── JSON 포맷: 파싱 검증 후에만 저장 ──
            // sanitizeAndValidateJson 은 백틱 제거 + JSON.parse 성공 여부만 돌려줌.
            const result = sanitizeAndValidateJson(fullContent)

            if (!result.ok) {
              // 파싱 실패 → 버전 저장하지 않고 에러 이벤트 송출
              // (원본 일부를 함께 보내 클라이언트 디버깅을 돕는다)
              send({
                type: 'error',
                text: `${result.error}\n\n원본 응답 일부:\n${fullContent.slice(0, 500)}`,
              })
              controller.close()
              return
            }

            // 파싱 성공 → 2-space pretty JSON 으로 통일해 저장
            // (cleaned 는 이미 JSON.parse 통과를 보장받은 문자열이므로 재파싱 안전)
            const parsed = JSON.parse(result.cleaned)
            const pretty = JSON.stringify(parsed, null, 2)
            const { version, timestamp } = await manager.saveVersion(
              pretty,
              'user_refinement',
              instruction
            )

            // done 이벤트에 파싱 결과를 함께 전달 (클라이언트가 바로 사용 가능)
            send({
              type: 'done',
              newVersion: version,
              timestamp,
              parsed,
            })
          } else {
            // ── 마크다운 포맷: 그대로 저장 ──
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
          }
        } catch (err) {
          // 버전 저장 단계 실패 (파일 시스템 에러 등)
          const message = err instanceof Error ? err.message : '버전 저장 실패'
          send({ type: 'error', text: message })
        }
        controller.close()
      })

      // 프로세스 자체 실행 실패 (예: claude 바이너리 없음)
      proc.on('error', (err: Error) => {
        send({ type: 'error', text: err.message })
        controller.close()
      })
    },
  })

  // SSE 응답 헤더
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
