import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'

export const runtime = 'nodejs'

// ─── 경로 설정 ────────────────────────────────────────────────
const HARNESS = path.join(process.cwd(), '.harness')
const RALPH_DIR = path.join(HARNESS, 'ralph-loop')
const CONFIG_FILE = path.join(RALPH_DIR, 'config.json')
const BULLETIN_FILE = path.join(RALPH_DIR, 'team_bulletin.md')
const STATUS_FILE = path.join(RALPH_DIR, 'status.json')

function ensureDir() {
  if (!fs.existsSync(RALPH_DIR)) fs.mkdirSync(RALPH_DIR, { recursive: true })
}

function loadJson(file: string) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch { return null }
}

// ─── 타입 정의 ────────────────────────────────────────────────
export type RalphConfig = {
  topic: string                // 루프 목표/주제
  enabled: boolean             // Ralph Loop 활성화
  maxIterations: number        // 최대 반복 횟수 (1-10)
  shipThreshold: number        // SHIP 기준 점수 (1.0-5.0)
  reviewCriteria: string       // SHIP 판단 기준 텍스트
  qualityGates: string         // 추가 품질 게이트
  leadModel: string            // Lead 모델 (opus/sonnet)
  tasks: { id: string; title: string; desc: string }[]  // 태스크 목록
  updatedAt?: string
}

const DEFAULT_CONFIG: RalphConfig = {
  topic: '',
  enabled: true,
  maxIterations: 3,
  shipThreshold: 4.0,
  reviewCriteria:
    '1. 요구사항을 100% 충족하는가\n2. 코드/결과물이 즉시 사용 가능한 수준인가\n3. 엣지케이스와 에러 처리가 포함됐는가\n4. 한글 주석이 충분히 작성됐는가\n5. 기존 패턴과 일관성이 있는가',
  qualityGates: '',
  leadModel: 'claude-sonnet-4-6',
  tasks: [],
}

// ─── Lead 프롬프트 생성 ────────────────────────────────────────
function buildLeadPrompt(config: RalphConfig): string {
  const taskList = config.tasks.map((t, i) =>
    `  ${i + 1}. [${t.id}] ${t.title}${t.desc ? '\n     설명: ' + t.desc : ''}`
  ).join('\n')

  const bulletinPath = BULLETIN_FILE

  return `[중요] 어떤 도구도 사용하지 말고, 아래 지시사항에 따라 Lead 에이전트로 행동하세요.
파일 쓰기는 불가능하므로 대신 모든 SHIP/REVISE 결정과 피드백을 stdout으로 출력하세요.

당신은 Ralph Loop의 **Lead 에이전트**입니다.
주제: ${config.topic || '(주제 없음)'}

━━━ Ralph Loop 설정 ━━━
활성화: ${config.enabled ? 'ON' : 'OFF'}
최대 반복 횟수: ${config.maxIterations}회
SHIP 기준 점수: ${config.shipThreshold}/5.0 이상

━━━ SHIP 평가 기준 ━━━
${config.reviewCriteria}
${config.qualityGates ? `\n━━━ 추가 품질 게이트 ━━━\n${config.qualityGates}` : ''}
━━━ 태스크 목록 ━━━
${taskList || '(태스크 없음 — 설계 탭에서 태스크를 추가하세요)'}
━━━━━━━━━━━━━━━━━━━

아래 형식으로 각 태스크에 대해 Ralph Loop를 시뮬레이션하세요:

1. **태스크 시작**: 각 태스크를 Worker에게 위임한다고 가정합니다
2. **Worker 결과 평가**: 평가 기준으로 0~5점 채점하고 SHIP 또는 REVISE 판정
3. **REVISE일 경우**: 구체적 피드백 작성 + 반복 횟수 증가
4. **SHIP일 경우**: 완료 처리 + 다음 태스크

각 단계에서 다음 형식으로 출력하세요:

\`\`\`
[TASK: {태스크ID}] {태스크 제목}
→ Worker 작업 위임 중...

[EVALUATE #{iteration}]
점수: {score}/5.0
판정: SHIP ✓ / REVISE ✗
근거: {평가 근거}

(REVISE인 경우)
[FEEDBACK #{iteration}]
부족한 점: {구체적으로}
개선 요청: {어떻게 수정할지}

(SHIP인 경우)
[COMPLETE] 태스크 {태스크ID} 완료 (#{iteration}회 반복)
\`\`\`

모든 태스크 완료 후 최종 요약을 작성하세요:
\`\`\`
[SUMMARY]
완료된 태스크: N개
평균 반복 횟수: X.X회
전체 품질 점수: X.X/5.0
주요 개선 패턴: ...
\`\`\``
}

// ─── GET: 설정 + 현황 조회 ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const what = searchParams.get('what') ?? 'config'

  if (what === 'bulletin') {
    // team_bulletin.md 반환 (현황 폴링용)
    const content = fs.existsSync(BULLETIN_FILE)
      ? fs.readFileSync(BULLETIN_FILE, 'utf-8')
      : ''
    const status = loadJson(STATUS_FILE) ?? { running: false }
    return NextResponse.json({ content, status })
  }

  // 기본: 설정 반환
  const config = loadJson(CONFIG_FILE) ?? DEFAULT_CONFIG
  const hasRun = fs.existsSync(BULLETIN_FILE)
  return NextResponse.json({ config, hasRun })
}

// ─── PUT: 설정 저장 ────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const config: RalphConfig = await req.json()
  ensureDir()
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...config, updatedAt: new Date().toISOString() }, null, 2))
  return NextResponse.json({ success: true })
}

// ─── POST: 실행 (SSE 스트리밍) ────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const config: RalphConfig = body.config ?? loadJson(CONFIG_FILE) ?? DEFAULT_CONFIG

  ensureDir()

  // 이전 bulletin 백업
  if (fs.existsSync(BULLETIN_FILE)) {
    fs.copyFileSync(BULLETIN_FILE, path.join(RALPH_DIR, 'team_bulletin.prev.md'))
    fs.unlinkSync(BULLETIN_FILE)
  }

  // 실행 상태 기록
  fs.writeFileSync(STATUS_FILE, JSON.stringify({ running: true, startedAt: new Date().toISOString() }, null, 2))

  const prompt = buildLeadPrompt(config)
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
        if (msg) send({ type: 'text', text: `▸ ${msg}\n` })
      })

      proc.on('close', () => {
        // bulletin 파일에 저장
        fs.writeFileSync(BULLETIN_FILE, fullContent, 'utf-8')
        // 상태 업데이트
        fs.writeFileSync(STATUS_FILE, JSON.stringify({
          running: false,
          completedAt: new Date().toISOString(),
        }, null, 2))

        send({ type: 'done' })
        controller.close()
      })

      proc.on('error', (err: Error) => {
        fs.writeFileSync(STATUS_FILE, JSON.stringify({ running: false, error: err.message }, null, 2))
        send({ type: 'error', text: err.message })
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}
