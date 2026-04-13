import { NextRequest, NextResponse } from 'next/server'
import { AIVersionManager } from '@/app/lib/ai-version-manager'

export const runtime = 'nodejs'

const PHASE_DIR = '.harness/ai-results/claude-md'

// ─── POST: 두 버전 간 diff 반환 ───────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { v1, v2 } = await req.json()

    if (!v1 || !v2) {
      return NextResponse.json(
        { error: '비교할 두 버전을 지정해주세요.' },
        { status: 400 }
      )
    }

    const manager = new AIVersionManager(PHASE_DIR)
    const diff = await manager.diffVersions(v1, v2)

    return NextResponse.json(diff)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'diff 생성 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
