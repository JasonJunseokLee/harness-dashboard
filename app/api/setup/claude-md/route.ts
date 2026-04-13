import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { AIVersionManager } from '@/app/lib/ai-version-manager'
import { getHarnessDir, getTargetProjectPath } from '@/app/lib/project-path'

export const runtime = 'nodejs'

// ─── 프로젝트 데이터 로드 헬퍼 ────────────────────────────────
function loadJson(file: string) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch { return null }
}

// 기술 스택을 읽기 쉬운 텍스트로 변환
function techStackText(ts: Record<string, string[] | string> | undefined): string {
  if (!ts) return '(미지정)'
  const lines: string[] = []
  if (Array.isArray(ts.frontend) && ts.frontend.length) lines.push(`- 프론트엔드: ${ts.frontend.join(', ')}`)
  if (Array.isArray(ts.backend) && ts.backend.length) lines.push(`- 백엔드: ${ts.backend.join(', ')}`)
  if (Array.isArray(ts.styling) && ts.styling.length) lines.push(`- 스타일링: ${ts.styling.join(', ')}`)
  if (Array.isArray(ts.database) && ts.database.length) lines.push(`- 데이터베이스: ${ts.database.join(', ')}`)
  if (Array.isArray(ts.testing) && ts.testing.length) lines.push(`- 테스팅: ${ts.testing.join(', ')}`)
  if (Array.isArray(ts.deployment) && ts.deployment.length) lines.push(`- 배포: ${ts.deployment.join(', ')}`)
  if (typeof ts.other === 'string' && ts.other.trim()) lines.push(`- 기타: ${ts.other}`)
  return lines.length ? lines.join('\n') : '(미지정)'
}

// PRD 요약 텍스트 추출
function prdSummary(prd: Record<string, unknown> | null): string {
  if (!prd) return '(PRD 없음)'
  const o = prd.overview as Record<string, string> | undefined
  const t = prd.target as Record<string, string> | undefined
  return [
    o?.oneLiner && `한 줄 정의: ${o.oneLiner}`,
    o?.problem && `문제: ${o.problem}`,
    o?.solution && `해결 방식: ${o.solution}`,
    t?.users && `타겟 사용자: ${t.users}`,
  ].filter(Boolean).join('\n')
}

// 기능 목록 추출 (최대 15개)
function featuresList(features: Record<string, unknown> | null): string {
  if (!features) return '(기능 명세 없음)'
  type TreeNode = { id: string; type: string; label: string; parentId?: string }
  const nodes = features.treeNodes as TreeNode[] | undefined
  if (!nodes) return '(기능 명세 없음)'
  const cats = nodes.filter(n => n.type === 'category')
  const feats = nodes.filter(n => n.type === 'feature').slice(0, 15)
  return feats.map(f => {
    const catParent = cats.find(c => c.id === f.parentId)
    return `- ${catParent ? catParent.label + ' > ' : ''}${f.label}`
  }).join('\n')
}

// ─── GET: 캐시된 CLAUDE.md 반환 ───────────────────────────────
export async function GET() {
  const HARNESS = getHarnessDir()
  const PROJECT_ROOT = getTargetProjectPath()
  const CACHE_FILE = path.join(HARNESS, 'setup-claudemd.json')

  if (fs.existsSync(CACHE_FILE)) {
    const data = loadJson(CACHE_FILE)
    return NextResponse.json({ exists: true, content: data?.content ?? '' })
  }
  // 프로젝트 루트에 이미 있으면 그걸 읽어 반환
  const rootFile = path.join(PROJECT_ROOT, 'CLAUDE.md')
  if (fs.existsSync(rootFile)) {
    const content = fs.readFileSync(rootFile, 'utf-8')
    return NextResponse.json({ exists: true, content })
  }
  return NextResponse.json({ exists: false, content: '' })
}

// ─── POST: claude -p 로 CLAUDE.md 생성 (SSE 스트리밍) ─────────
export async function POST(req: NextRequest) {
  const HARNESS = getHarnessDir()
  const CACHE_FILE = path.join(HARNESS, 'setup-claudemd.json')
  const VERSION_DIR = path.join(HARNESS, 'ai-results', 'claude-md', 'versions')

  const body = await req.json().catch(() => ({}))
  const instruction: string = body.instruction ?? ''
  const project = loadJson(path.join(HARNESS, 'project.json'))
  const prd = loadJson(path.join(HARNESS, 'prd.json'))
  const features = loadJson(path.join(HARNESS, 'features.json'))
  const workflow = loadJson(path.join(HARNESS, 'workflow.json'))

  if (!project) {
    return new Response(JSON.stringify({ error: '온보딩을 먼저 완료해주세요.' }), { status: 400 })
  }

  const techStack = techStackText(project.techStack)
  const prdText = prdSummary(prd)
  const featText = featuresList(features)

  // 워크플로우 주요 단계 추출
  const flowSteps = (workflow?.nodes as Array<{ data?: { label?: string } }> | undefined)
    ?.filter(n => n.data?.label)
    .slice(0, 8)
    .map(n => `- ${n.data!.label}`)
    .join('\n') ?? '(워크플로우 없음)'

  const instructionSection = instruction.trim()
    ? `\n[사용자 추가 지시사항 — 최우선으로 반영하세요]\n${instruction.trim()}\n`
    : ''

  // 재생성 시 기존 캐시 삭제 (claude가 파일 읽고 "이미 존재" 응답하는 것 방지)
  if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE)

  const prompt = `[중요] 파일 읽기, 파일 쓰기, 터미널 실행 등 어떤 도구도 사용하지 마세요. 오직 마크다운 텍스트만 stdout으로 출력하세요.

당신은 시니어 소프트웨어 엔지니어이자 AI 협업 전문가입니다.${instructionSection}
아래 프로젝트 정보를 바탕으로, Claude Code(AI 코딩 어시스턴트)가 이 프로젝트에서 최고의 성과를 낼 수 있도록
프로젝트 전용 CLAUDE.md 파일을 작성해주세요.

━━━ 프로젝트 정보 ━━━
[설명]
${project.description}

[기술 스택]
${techStack}

[PRD 요약]
${prdText}

[주요 기능]
${featText}

[유저 워크플로우]
${flowSteps}
━━━━━━━━━━━━━━━━━━━

CLAUDE.md는 아래 섹션을 포함해야 합니다:

# 1. 프로젝트 개요
짧고 명확한 1-2문장 설명

# 2. 기술 스택 & 빌드 명령어
- 실제 기술 스택 목록
- 개발 서버 실행, 빌드, 테스트, 린팅 명령어 (기술 스택에 맞게 추정)
- 예: npm run dev, npm run build, npm test 등

# 3. 디렉토리 구조
기술 스택에 맞는 주요 디렉토리 구조 (tree 형식)

# 4. 코딩 컨벤션
- 파일/컴포넌트 네이밍 규칙
- 코드 스타일 규칙 (기술 스택 기반)
- 주석 규칙 (한글 주석 권장)
- import 순서

# 5. 하네스 워크플로우
- 이 프로젝트의 하네스 레벨 (Level 1 또는 2 추천)
- Generator/Evaluator 역할 설명
- 스프린트 단위 작업 흐름

# 6. 핵심 기능 구현 가이드
주요 기능 3-5개에 대한 간단한 구현 접근 방향

# 7. 주의사항 & 금지 패턴
이 프로젝트에서 피해야 할 패턴과 이유

# 8. Definition of Done
각 기능이 완료되었다고 판단하는 기준 체크리스트

실용적이고 구체적으로 작성하세요. 추상적인 조언보다 실제로 사용 가능한 명령어와 코드 패턴을 포함하세요.
마크다운 형식으로만 응답하세요.`

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
        // 캐시에 저장
        if (!fs.existsSync(HARNESS)) fs.mkdirSync(HARNESS, { recursive: true })
        fs.writeFileSync(CACHE_FILE, JSON.stringify({ content: fullContent, generatedAt: new Date().toISOString() }, null, 2))

        // setup.json 업데이트 (완료 마킹)
        const setupFile = path.join(HARNESS, 'setup.json')
        const existing = fs.existsSync(setupFile) ? loadJson(setupFile) : {}
        fs.writeFileSync(setupFile, JSON.stringify({ ...existing, claudeMd: true, updatedAt: new Date().toISOString() }, null, 2))

        // 버전 관리에도 저장
        try {
          const manager = new AIVersionManager(VERSION_DIR)
          const { version, timestamp } = await manager.saveVersion(
            fullContent,
            'initial',
            instruction || undefined
          )
          send({ type: 'done', newVersion: version, timestamp })
        } catch {
          send({ type: 'done' })
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

// ─── PUT: 편집된 CLAUDE.md를 프로젝트 루트에 저장 ─────────────
export async function PUT(req: NextRequest) {
  const HARNESS = getHarnessDir()
  const PROJECT_ROOT = getTargetProjectPath()
  const CACHE_FILE = path.join(HARNESS, 'setup-claudemd.json')

  const { content } = await req.json()
  if (!content) return NextResponse.json({ error: '내용이 없습니다.' }, { status: 400 })

  // 프로젝트 루트에 저장
  fs.writeFileSync(path.join(PROJECT_ROOT, 'CLAUDE.md'), content, 'utf-8')

  // 캐시도 갱신
  if (!fs.existsSync(HARNESS)) fs.mkdirSync(HARNESS, { recursive: true })
  fs.writeFileSync(CACHE_FILE, JSON.stringify({ content, generatedAt: new Date().toISOString() }, null, 2))

  return NextResponse.json({ success: true, savedTo: 'CLAUDE.md' })
}
