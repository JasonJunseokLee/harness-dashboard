import { NextRequest, NextResponse } from 'next/server'
import { AIVersionManager } from '@/app/lib/ai-version-manager'
import { isSupportedPhase, getPhaseDir } from '@/app/lib/ai-phase-config'

export const runtime = 'nodejs'

// ─────────────────────────────────────────────────────────────
// GET /api/ai-results/[phase]/versions/[version]
// 특정 버전(version: "v1", "v2", ...)의 내용과 메타데이터를 반환한다.
// ─────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ phase: string; version: string }> }
) {
  try {
    const { phase, version } = await params

    // phase 검증
    if (!isSupportedPhase(phase)) {
      return NextResponse.json(
        { error: `지원하지 않는 phase 입니다: ${phase}` },
        { status: 400 }
      )
    }

    const manager = new AIVersionManager(getPhaseDir(phase))
    const data = await manager.getVersion(version)

    // 본문 + 메타데이터 병합해서 반환
    return NextResponse.json({
      phase,
      version: version,
      content: data.content,
      ...data.metadata,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '버전 조회 실패'
    // "찾을 수 없" / "존재하지 않" 메시지는 404, 그 외는 500 으로 분기
    const status =
      message.includes('찾을 수 없') || message.includes('존재하지 않') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
