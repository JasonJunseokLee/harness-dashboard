import { NextRequest, NextResponse } from 'next/server'
import { AIVersionManager } from '@/app/lib/ai-version-manager'
import { isSupportedPhase, getPhaseDir } from '@/app/lib/ai-phase-config'

export const runtime = 'nodejs'

// ─────────────────────────────────────────────────────────────
// POST /api/ai-results/[phase]/diff
// body: { v1: "v2", v2: "v3" }
// 두 버전 간 줄 단위 diff(및 통계)를 반환한다.
// ─────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ phase: string }> }
) {
  try {
    const { phase } = await params

    // phase 검증
    if (!isSupportedPhase(phase)) {
      return NextResponse.json(
        { error: `지원하지 않는 phase 입니다: ${phase}` },
        { status: 400 }
      )
    }

    const { v1, v2 } = await req.json()

    if (!v1 || !v2) {
      return NextResponse.json(
        { error: '비교할 두 버전을 지정해주세요.' },
        { status: 400 }
      )
    }

    const manager = new AIVersionManager(getPhaseDir(phase))
    const diff = await manager.diffVersions(v1, v2)

    return NextResponse.json({
      phase,
      ...diff,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'diff 생성 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
