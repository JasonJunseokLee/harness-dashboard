import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { getHarnessDir, getTargetProjectPath } from '@/app/lib/project-path'

export const runtime = 'nodejs'

// 스캔에서 제외할 디렉토리/파일 패턴
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out', '.cache',
  '__pycache__', '.venv', 'venv', '.env', 'coverage', '.nyc_output',
  'vendor', 'target', '.gradle', 'Pods', '.harness',
])
const SKIP_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.pdf', '.zip', '.tar', '.gz', '.lock',
  '.mp4', '.mp3', '.avi', '.mov',
])
// 최우선으로 읽을 파일들
const PRIORITY_FILES = [
  'README.md', 'README.txt', 'readme.md',
  'package.json', 'requirements.txt', 'Cargo.toml', 'go.mod', 'pyproject.toml',
  'CLAUDE.md', 'AGENTS.md',
]

// 디렉토리 트리 텍스트 생성 (최대 depth 3)
function buildDirTree(dir: string, prefix = '', depth = 0): string {
  if (depth > 3) return ''
  let result = ''
  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return '' }

  const filtered = entries.filter(e => {
    if (e.name.startsWith('.') && e.name !== '.env.example') return false
    if (SKIP_DIRS.has(e.name)) return false
    if (SKIP_EXTS.has(path.extname(e.name).toLowerCase())) return false
    return true
  }).slice(0, 40) // 너무 많으면 잘라냄

  filtered.forEach((entry, i) => {
    const isLast = i === filtered.length - 1
    const connector = isLast ? '└── ' : '├── '
    result += `${prefix}${connector}${entry.name}\n`
    if (entry.isDirectory()) {
      result += buildDirTree(
        path.join(dir, entry.name),
        prefix + (isLast ? '    ' : '│   '),
        depth + 1
      )
    }
  })
  return result
}

// 파일 내용 읽기 (크기 제한 + 바이너리 제외)
function readFileSafe(filePath: string, maxBytes = 8000): string {
  try {
    const ext = path.extname(filePath).toLowerCase()
    if (SKIP_EXTS.has(ext)) return ''
    const stat = fs.statSync(filePath)
    if (stat.size > 100_000) return '(파일 크기 초과 — 생략)'
    const content = fs.readFileSync(filePath, 'utf-8').replace(/\0/g, '')
    return content.length > maxBytes ? content.slice(0, maxBytes) + '\n...(생략)' : content
  } catch { return '' }
}

// git log 요약 (최근 30개)
function getGitLog(dir: string): string {
  try {
    const { execSync } = require('child_process')
    const log = execSync(
      'git log --oneline -30 --no-merges',
      { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
    return log.trim()
  } catch { return '(git 히스토리 없음)' }
}

// 주요 소스 파일 샘플링 (app/, src/, pages/, api/ 등)
function sampleSourceFiles(projectDir: string, maxFiles = 8): string {
  const result: string[] = []
  const sourceDirs = ['src', 'app', 'pages', 'lib', 'api', 'server', 'backend']
  const sourceExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java']

  for (const srcDir of sourceDirs) {
    const fullDir = path.join(projectDir, srcDir)
    if (!fs.existsSync(fullDir)) continue
    try {
      const files = fs.readdirSync(fullDir, { withFileTypes: true })
        .filter(e => e.isFile() && sourceExts.includes(path.extname(e.name).toLowerCase()))
        .slice(0, 3)
      for (const f of files) {
        if (result.length >= maxFiles) break
        const content = readFileSafe(path.join(fullDir, f.name), 1500)
        if (content) result.push(`--- ${srcDir}/${f.name} ---\n${content}`)
      }
    } catch { /* 무시 */ }
    if (result.length >= maxFiles) break
  }
  return result.join('\n\n')
}

// GET: 저장된 분석 결과 반환
export async function GET() {
  const HARNESS = getHarnessDir()
  const RESULT_FILE = path.join(HARNESS, 'codebase-scan.json')
  if (!fs.existsSync(RESULT_FILE)) return NextResponse.json({ exists: false })
  try {
    const data = JSON.parse(fs.readFileSync(RESULT_FILE, 'utf-8'))
    return NextResponse.json({ exists: true, data })
  } catch {
    return NextResponse.json({ exists: false })
  }
}

// POST: 코드베이스 분석 (SSE 스트리밍)
export async function POST() {
  const PROJECT_DIR = getTargetProjectPath()
  const HARNESS = getHarnessDir()
  const RESULT_FILE = path.join(HARNESS, 'codebase-scan.json')

  // ── 프로젝트 정보 수집 ──────────────────────────────────────
  const dirTree = buildDirTree(PROJECT_DIR)

  // 우선순위 파일 읽기
  const priorityContents = PRIORITY_FILES
    .map(f => {
      const fp = path.join(PROJECT_DIR, f)
      if (!fs.existsSync(fp)) return null
      const content = readFileSafe(fp, 5000)
      return content ? `--- ${f} ---\n${content}` : null
    })
    .filter(Boolean)
    .join('\n\n')

  const gitLog = getGitLog(PROJECT_DIR)
  const sourceFiles = sampleSourceFiles(PROJECT_DIR)

  const prompt = `[중요] 파일 읽기, 파일 쓰기, 터미널 실행 등 어떤 도구도 사용하지 마세요. 순수 JSON만 stdout으로 출력하세요.

당신은 시니어 소프트웨어 아키텍트입니다. 아래 코드베이스를 분석해 하네스 기획 문서를 역으로 생성해주세요.

━━━ 프로젝트 디렉토리 구조 ━━━
${dirTree}

━━━ 주요 파일 내용 ━━━
${priorityContents || '(주요 파일 없음)'}

━━━ git 커밋 히스토리 (최근 30개) ━━━
${gitLog}

━━━ 주요 소스 파일 샘플 ━━━
${sourceFiles || '(소스 파일 없음)'}
━━━━━━━━━━━━━━━━━━━━━━━

분석 결과를 아래 JSON 형식으로만 반환하세요. 마크다운 없이 순수 JSON:

{
  "projectName": "프로젝트명",
  "description": "프로젝트 한 줄 설명 (누구를 위해 어떤 문제를 어떻게 해결하는지)",
  "techStack": {
    "frontend": ["기술1", "기술2"],
    "backend": ["기술1"],
    "styling": ["기술1"],
    "database": ["기술1"],
    "deployment": []
  },
  "completionEstimate": 50,
  "prd": {
    "overview": {
      "oneLiner": "한 줄 정의",
      "problem": "해결하는 문제",
      "solution": "해결 방식",
      "differentiation": "차별점"
    },
    "target": {
      "users": "타겟 사용자",
      "scenario": "사용 시나리오"
    },
    "success": {
      "kpis": ["KPI 1", "KPI 2", "KPI 3"],
      "risks": ["리스크 1", "리스크 2"]
    },
    "attributes": {
      "roles": ["사용자 역할"],
      "devices": ["웹", "모바일"]
    }
  },
  "features": [
    {
      "id": "f1",
      "category": "카테고리명",
      "label": "기능명 (15자 이내)",
      "description": "기능 설명 (40자 이내)",
      "status": "done",
      "evidence": "이 기능이 구현됐다고 판단한 근거 (파일명/커밋 등)"
    }
  ],
  "devlogEntries": [
    "git 히스토리에서 추론한 주요 개발 사건 1",
    "주요 개발 사건 2"
  ],
  "nextSuggestions": [
    "다음으로 구현하면 좋을 기능 1",
    "다음 기능 2"
  ]
}

status 규칙:
- "done": 코드에 명확히 구현된 것
- "in-progress": 일부만 구현되었거나 진행 중으로 보이는 것
- "todo": 기획은 필요하지만 코드가 없는 것

features는 10~20개로 구성하세요. 실제 코드에서 확인된 것만 "done"으로 표시하세요.`

  const enc = new TextEncoder()
  let fullContent = ''
  let lastSavedLength = 0

  const stream = new ReadableStream({
    start(controller) {
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

      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        fullContent += text
        send({ type: 'text', text })
        // 300자마다 중간 저장
        if (fullContent.length - lastSavedLength > 300) {
          if (!fs.existsSync(HARNESS)) fs.mkdirSync(HARNESS, { recursive: true })
          fs.writeFileSync(RESULT_FILE, fullContent, 'utf-8')
          lastSavedLength = fullContent.length
        }
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        const msg = chunk.toString().trim()
        if (msg) send({ type: 'text', text: `▸ ${msg}\n` })
      })

      proc.on('close', () => {
        if (!fs.existsSync(HARNESS)) fs.mkdirSync(HARNESS, { recursive: true })
        try {
          const cleaned = fullContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          const parsed = JSON.parse(cleaned)

          // 분석 결과 저장
          fs.writeFileSync(RESULT_FILE, JSON.stringify(parsed, null, 2), 'utf-8')

          // PRD 자동 저장
          if (parsed.prd) {
            fs.writeFileSync(path.join(HARNESS, 'prd.json'), JSON.stringify(parsed.prd, null, 2))
          }

          // 기능명세 자동 변환 + 저장
          if (parsed.features?.length) {
            const cats = [...new Set((parsed.features as Array<{category: string}>).map(f => f.category))]
            const treeNodes = [
              { id: 'root', type: 'root', label: parsed.projectName, parentId: null, description: '' },
              ...cats.map((c, i) => ({ id: `cat${i+1}`, type: 'category', label: c, parentId: 'root',
                color: ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4'][i % 6], description: '' })),
              ...(parsed.features as Array<{id:string;category:string;label:string;description:string}>).map((f, i) => {
                const catIdx = cats.indexOf(f.category)
                return { id: `f${i+1}`, type: 'feature', label: f.label, parentId: `cat${catIdx+1}`,
                  description: f.description, priority: 'medium' }
              }),
            ]
            fs.writeFileSync(path.join(HARNESS, 'features.json'), JSON.stringify({ productName: parsed.projectName, treeNodes }, null, 2))

            // features.status.json 자동 생성 (done/in-progress 상태 반영)
            const nodes: Record<string, {status: string; note: string; updatedAt: string}> = {}
            const featureItems = parsed.features as Array<{id:string;label:string;status:string;evidence:string}>
            featureItems.forEach((f, i) => {
              nodes[`f${i+1}`] = {
                status: f.status ?? 'todo',
                note: f.evidence ?? '',
                updatedAt: new Date().toISOString(),
              }
            })
            fs.writeFileSync(path.join(HARNESS, 'features.status.json'), JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), nodes }, null, 2))
          }

          // devlog 자동 생성 (git 히스토리 기반)
          if (parsed.devlogEntries?.length) {
            const logPath = path.join(HARNESS, 'devlog.md')
            const entries = (parsed.devlogEntries as string[])
              .map(e => `\n## ${new Date().toISOString()}\n[코드베이스 분석] ${e}`)
              .join('\n')
            const existing = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf-8') : ''
            fs.writeFileSync(logPath, existing + entries)
          }

          // project.json 자동 저장
          const projectData = {
            createdAt: new Date().toISOString(),
            description: parsed.description,
            techStack: parsed.techStack,
            completionEstimate: parsed.completionEstimate,
            scanMode: true,
            questions: [],
            answers: {},
            status: 'onboarding_done',
          }
          fs.writeFileSync(path.join(HARNESS, 'project.json'), JSON.stringify(projectData, null, 2))

          send({ type: 'done', result: parsed })
        } catch {
          // 파싱 실패해도 raw 저장은 유지
          fs.writeFileSync(RESULT_FILE, fullContent, 'utf-8')
          send({ type: 'done', error: 'JSON 파싱 실패 — codebase-scan.json(raw) 확인' })
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
