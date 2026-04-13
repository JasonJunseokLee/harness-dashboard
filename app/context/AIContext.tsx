"use client";

import { createContext, useContext, useState, ReactNode, useCallback } from "react";

// ─── AI Context 타입 ────────────────────────────────────────
interface AIContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  phase: string; // "prd", "sprint-plan", "ralph-loop" 등
  setPhase: (phase: string) => void;
  // 페이지별 빠른선택 칩 (RefinementPanel에 전달)
  presets: string[];
  setPresets: (presets: string[]) => void;
  // 각 page의 콘텐츠와 업데이트 함수
  currentContent: any;
  setCurrentContent: (content: any) => void;
  onContentUpdate: ((content: any) => void) | null;
  registerContentUpdater: (updater: (content: any) => void) => void;
  unregisterContentUpdater: () => void;
}

// ─── Context 생성 ────────────────────────────────────────────
const AIContext = createContext<AIContextType | undefined>(undefined);

// ─── Provider ───────────────────────────────────────────────
export function AIProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState("prd");
  const [presets, setPresets] = useState<string[]>([]);
  const [currentContent, setCurrentContent] = useState<any>(null);
  const [onContentUpdate, setOnContentUpdate] = useState<((content: any) => void) | null>(null);

  const registerContentUpdater = useCallback((updater: (content: any) => void) => {
    setOnContentUpdate(() => updater);
  }, []);

  const unregisterContentUpdater = useCallback(() => {
    setOnContentUpdate(null);
  }, []);

  return (
    <AIContext.Provider
      value={{
        isOpen,
        setIsOpen,
        phase,
        setPhase,
        presets,
        setPresets,
        currentContent,
        setCurrentContent,
        onContentUpdate,
        registerContentUpdater,
        unregisterContentUpdater,
      }}
    >
      {children}
    </AIContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────
export function useAI() {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error("useAI must be used within AIProvider");
  }
  return context;
}
