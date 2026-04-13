import { NextResponse } from 'next/server'
import { AIVersionManager } from '@/app/lib/ai-version-manager'

export const runtime = 'nodejs'

const PHASE_DIR = '.harness/ai-results/claude-md'

// ─── GET: 모든 버전 목록 반환 ──────────────────────────────────
export async function GET() {
  try {
    const manager = new AIVersionManager(PHASE_DIR)
    const { current, list } = await manager.listVersions()

    return NextResponse.json({
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
