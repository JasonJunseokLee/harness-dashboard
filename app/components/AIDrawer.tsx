"use client";

import { useAI } from "@/app/context/AIContext";
import RefinementPanel from "@/app/components/RefinementPanel";
import VersionHistoryPanel from "@/app/components/VersionHistoryPanel";
import { useAIRefinement } from "@/app/lib/useAIRefinement";
import { useEffect, useCallback } from "react";

// ─── AI 드로어 (글로벌 AI 인터페이스) ────────────────────────
export default function AIDrawer() {
  const { isOpen, setIsOpen, phase, presets, currentContent, setCurrentContent, onContentUpdate, registerContentUpdater, unregisterContentUpdater } = useAI();

  // AI 수정 완료 후 page 콘텐츠 업데이트
  const handleContentChange = useCallback(
    (newContent: any) => {
      setCurrentContent(newContent);
      if (onContentUpdate) {
        onContentUpdate(newContent);
      }
    },
    [setCurrentContent, onContentUpdate]
  );

  // 현재 phase에 대한 AI refinement 훅
  // Context에서 가져온 콘텐츠를 사용하여 AI 수정 수행
  const refinement = useAIRefinement({
    phase,
    format: "json",
    currentContent,
    onContentChange: handleContentChange,
  });

  return (
    <>
      {/* 드로어가 닫혀있을 때 우측 하단 플로팅 버튼 */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg shadow-blue-900/40 transition-all duration-200 hover:shadow-blue-800/50 hover:-translate-y-0.5"
        >
          {/* 스파클 아이콘 */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" />
          </svg>
          AI 대화
        </button>
      )}

      {/* 배경 오버레이 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* 드로어 — 항상 fixed로 우측 고정 */}
      <div
        className={`
          fixed right-0 top-0 h-screen w-80 bg-zinc-900 border-l border-zinc-800 z-50
          transform transition-transform duration-300 ease-out
          ${isOpen ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* 헤더 (닫기 버튼 항상 표시) */}
        <div className="px-4 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">AI 대화</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="text-zinc-500 hover:text-zinc-300 text-sm"
          >
            ✕
          </button>
        </div>

        {/* 콘텐츠 — 헤더(60px) 제외한 높이로 스크롤 */}
        <div className="h-[calc(100vh-60px)] overflow-y-auto p-4 space-y-4">
          {/* AI 수정 요청 패널 — 페이지별 presets 전달 */}
          <RefinementPanel
            onRefine={refinement.handleRefine}
            isRefining={refinement.isRefining}
            progressText={refinement.refineProgress}
            error={refinement.error}
            hasContent={!!currentContent}
            presets={presets.length > 0 ? presets : undefined}
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
      </div>
    </>
  );
}
