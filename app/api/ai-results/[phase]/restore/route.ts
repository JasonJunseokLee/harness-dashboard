import { NextRequest, NextResponse } from 'next/server'
import { AIVersionManager } from '@/app/lib/ai-version-manager'
import { isSupportedPhase, getPhaseDir } from '@/app/lib/ai-phase-config'

export const runtime = 'nodejs'

// ─────────────────────────────────────────────────────────────
// POST /api/ai-results/[phase]/restore
// body: { toVersion: "v2" }
// 지정한 과거 버전을 현재 버전으로 되살린다.
// 복원 행위 자체도 새 버전으로 기록되므로 히스토리는 선형적으로 유지된다.
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

    const { toVersion } = await req.json()

    if (!toVersion) {
      return NextResponse.json(
        { error: '복원할 버전을 지정해주세요.' },
        { status: 400 }
      )
    }

    const manager = new AIVersionManager(getPhaseDir(phase))
    const { newVersion } = await manager.restoreVersion(toVersion)

    return NextResponse.json({
      phase,
      restored: toVersion,
      newVersion,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '버전 복원 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
