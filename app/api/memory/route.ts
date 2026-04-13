import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

export const runtime = 'nodejs'

// ─── 현재 프로젝트의 claude memory 폴더 경로 계산 ─────────────
// ~/.claude/projects/{encoded-path}/memory/
// 인코딩 규칙: cwd의 절대경로에서 /를 -로 치환
function getMemoryDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  const cwd = process.cwd()
  // /Users/junseok/CascadeProjects/harness-dashboard
  // → -Users-junseok-CascadeProjects-harness-dashboard
  const encoded = cwd.replace(/\//g, '-')
  return path.join(home, '.claude', 'projects', encoded, 'memory')
}

// ─── GET: memory 파일 목록 + 내용 반환 ────────────────────────
export async function GET() {
  const memDir = getMemoryDir()

  if (!fs.existsSync(memDir)) {
    return NextResponse.json({ files: [], memoryDir: memDir })
  }

  const fileNames = fs.readdirSync(memDir)
    .filter(f => f.endsWith('.md'))
    .sort() // 이름순 정렬

  const files = fileNames.map(name => {
    const filePath = path.join(memDir, name)
    const content = fs.readFileSync(filePath, 'utf-8')
    const stat = fs.statSync(filePath)

    // 프론트매터에서 type, description 추출
    const typeMatch = content.match(/^type:\s*(.+)$/m)
    const descMatch = content.match(/^description:\s*(.+)$/m)
    const nameMatch = content.match(/^name:\s*(.+)$/m)

    // 프론트매터 제거 후 본문만
    const body = content.replace(/^---[\s\S]*?---\n?/, '').trim()

    return {
      name,
      label: nameMatch?.[1]?.trim() ?? name.replace('.md', ''),
      type: (typeMatch?.[1]?.trim() ?? 'project') as string,
      description: descMatch?.[1]?.trim() ?? '',
      body,
      updatedAt: stat.mtime.toISOString(),
    }
  })

  return NextResponse.json({ files, memoryDir: memDir })
}
