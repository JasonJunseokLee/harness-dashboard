import { NextRequest, NextResponse } from 'next/server'
import { AIVersionManager } from '@/app/lib/ai-version-manager'
import { isSupportedPhase, getPhaseDir } from '@/app/lib/ai-phase-config'

export const runtime = 'nodejs'

// ─────────────────────────────────────────────────────────────
// GET /api/ai-results/[phase]/versions
// 해당 phase 의 모든 버전 목록과 현재 활성 버전을 반환한다.
// ─────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ phase: string }> }
) {
  try {
    const { phase } = await params

    // phase 검증 (지원 목록 외의 값이면 400)
    if (!isSupportedPhase(phase)) {
      return NextResponse.json(
        { error: `지원하지 않는 phase 입니다: ${phase}` },
        { status: 400 }
      )
    }

    // phase 별 저장 디렉토리로 AIVersionManager 초기화
    const manager = new AIVersionManager(getPhaseDir(phase))
    const { current, list } = await manager.listVersions()

    // 클라이언트가 필요로 하는 필드만 추려서 반환
    return NextResponse.json({
      phase,
      current,
      versions: list.map(v => ({
        v: v.v,
        timestamp: v.timestamp,
        source: v.source,
        size: v.size,
        lines: v.lines,
        instruction: v.instruction,
        preview: v.preview,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '버전 목록 조회 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
