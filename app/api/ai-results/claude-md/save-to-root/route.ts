import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import { AIVersionManager } from '@/app/lib/ai-version-manager'

export const runtime = 'nodejs'

const PHASE_DIR = '.harness/ai-results/claude-md'

// ─── POST: 특정 버전을 프로젝트 루트에 저장 ────────────────────
export async function POST(req: NextRequest) {
  try {
    const { version, targetPath } = await req.json()

    // targetPath 기본값: "CLAUDE.md"
    const target = targetPath || 'CLAUDE.md'

    // 경로 순회 공격 방지
    const resolved = path.resolve(process.cwd(), target)
    if (!resolved.startsWith(process.cwd())) {
      return NextResponse.json(
        { error: '유효하지 않은 저장 경로입니다.' },
        { status: 400 }
      )
    }

    const manager = new AIVersionManager(PHASE_DIR)

    // version이 지정되지 않으면 현재 버전 사용
    let content: string
    if (version) {
      const data = await manager.getVersion(version)
      content = data.content
    } else {
      const current = await manager.getCurrentVersion()
      if (!current) {
        return NextResponse.json(
          { error: '저장할 버전이 없습니다.' },
          { status: 404 }
        )
      }
      content = current.content
    }

    // 프로젝트 루트에 저장
    fs.writeFileSync(resolved, content, 'utf-8')

    return NextResponse.json({
      success: true,
      savedAt: resolved,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '파일 저장 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
