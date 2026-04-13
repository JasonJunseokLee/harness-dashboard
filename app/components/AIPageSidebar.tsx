"use client";

import RefinementPanel from "@/app/components/RefinementPanel";
import VersionHistoryPanel from "@/app/components/VersionHistoryPanel";
import type { UseAIRefinementReturn } from "@/app/lib/useAIRefinement";

// ─── AI 수정 사이드 패널 (모든 페이지 공통) ─────────────────
interface AIPageSidebarProps {
  phase: string;                          // "prd", "sprint-plan", "ralph-loop" 등
  presets?: string[];                     // phase별 AI 수정 프리셋
  refinement: UseAIRefinementReturn;      // useAIRefinement 훅 반환값
  error?: string | null;                  // 페이지의 생성/API 에러 (refinement.error와 별개)
  hasContent?: boolean;                   // 콘텐츠 있는지 여부 (RefinementPanel 모드용)
}

export default function AIPageSidebar({
  phase,
  presets,
  refinement,
  error,
  hasContent = true,
}: AIPageSidebarProps) {
  // 페이지 에러와 AI 수정 에러를 함께 표시
  const hasError = error || refinement.error;

  return (
    <div className="space-y-4">
      {/* 에러 표시 (통합) */}
      {hasError && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-3 text-red-300 text-xs">
          {error || refinement.error}
        </div>
      )}

      {/* AI 생성/수정 요청 패널 */}
      <RefinementPanel
        onRefine={refinement.handleRefine}
        isRefining={refinement.isRefining}
        progressText={refinement.refineProgress}
        error={refinement.error}
        presets={presets}
        hasContent={hasContent}
      />

      {/* 버전 히스토리 패널 */}
      <VersionHistoryPanel
        phase={phase}
        onSelectVersion={refinement.handleSelectVersion}
        onRestore={refinement.handleRestore}
        currentVersion={refinement.currentVersion}
        refreshTrigger={refinement.versionRefresh}
      />
    </div>
  );
}
