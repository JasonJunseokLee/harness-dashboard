import { NextRequest, NextResponse } from 'next/server'
import { AIVersionManager } from '@/app/lib/ai-version-manager'

export const runtime = 'nodejs'

const PHASE_DIR = '.harness/ai-results/claude-md'

// ─── GET: 특정 버전 내용 반환 ──────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ version: string }> }
) {
  try {
    const { version } = await params
    const manager = new AIVersionManager(PHASE_DIR)
    const data = await manager.getVersion(version)

    return NextResponse.json({
      content: data.content,
      ...data.metadata,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '버전 조회 실패'
    return NextResponse.json({ error: message }, { status: 404 })
  }
}
