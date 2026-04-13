import { NextRequest, NextResponse } from 'next/server'
import { AIVersionManager } from '@/app/lib/ai-version-manager'

export const runtime = 'nodejs'

const PHASE_DIR = '.harness/ai-results/claude-md'

// ─── POST: 특정 버전으로 복원 ──────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { toVersion } = await req.json()

    if (!toVersion) {
      return NextResponse.json(
        { error: '복원할 버전을 지정해주세요.' },
        { status: 400 }
      )
    }

    const manager = new AIVersionManager(PHASE_DIR)
    const { newVersion } = await manager.restoreVersion(toVersion)

    return NextResponse.json({
      restored: toVersion,
      newVersion,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '버전 복원 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
