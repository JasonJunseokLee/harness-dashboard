"use client";

import { useAI } from "@/app/context/AIContext";
import RefinementPanel from "@/app/components/RefinementPanel";
import VersionHistoryPanel from "@/app/components/VersionHistoryPanel";
import { useAIRefinement } from "@/app/lib/useAIRefinement";
import { useEffect, useCallback } from "react";

// ─── AI 드로어 (글로벌 AI 인터페이스) ────────────────────────
export default function AIDrawer() {
  const { isOpen, setIsOpen, phase, presets, currentContent, setCurrentContent, onContentUpdate } = useAI();

  const handleContentChange = useCallback(
    (newContent: any) => {
      setCurrentContent(newContent);
      if (onContentUpdate) onContentUpdate(newContent);
    },
    [setCurrentContent, onContentUpdate]
  );

  const refinement = useAIRefinement({
    phase,
    format: "json",
    currentContent,
    onContentChange: handleContentChange,
  });

  // ESC 키로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, setIsOpen]);

  return (
    <>
      {/* 우측 하단 플로팅 토글 버튼 — 항상 표시 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          fixed bottom-6 right-6 z-50 flex items-center gap-2 text-sm font-medium
          px-4 py-2.5 rounded-full shadow-lg transition-all duration-200
          hover:-translate-y-0.5 active:translate-y-0
          ${isOpen
            ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-300 shadow-black/30"
            : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/40 hover:shadow-blue-800/50"
          }
        `}
        title={isOpen ? "AI 패널 닫기 (ESC)" : "AI 패널 열기"}
      >
        {isOpen ? (
          // 닫기 아이콘 (X)
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          // 스파클 아이콘
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" />
          </svg>
        )}
        {isOpen ? "닫기" : "AI 대화"}
      </button>

      {/* 드로어 — 오버레이 없이 우측에 슬라이드 (내용 가리지 않음) */}
      <div
        className={`
          fixed right-0 top-0 h-screen w-80 bg-zinc-900 border-l border-zinc-800 z-40
          transform transition-transform duration-300 ease-out
          ${isOpen ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* 헤더 */}
        <div className="px-4 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">AI 대화</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="닫기 (ESC)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 콘텐츠 */}
        <div className="h-[calc(100vh-60px)] overflow-y-auto p-4 space-y-4">
          <RefinementPanel
            onRefine={refinement.handleRefine}
            isRefining={refinement.isRefining}
            progressText={refinement.refineProgress}
            error={refinement.error}
            hasContent={!!currentContent}
            presets={presets.length > 0 ? presets : undefined}
          />
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
