"use client";

import { useState, useEffect } from "react";

// ─── 생성 타입별 단계 메시지 ──────────────────────────────────
const STAGES: Record<string, { threshold: number; label: string }[]> = {
  analysis: [
    { threshold: 0,  label: "업로드된 자료를 읽고 있습니다..." },
    { threshold: 20, label: "핵심 내용을 파악하고 있습니다..." },
    { threshold: 45, label: "인사이트를 추출하고 있습니다..." },
    { threshold: 70, label: "리포트를 구조화하고 있습니다..." },
    { threshold: 90, label: "마무리 검토 중..." },
  ],
  prd: [
    { threshold: 0,  label: "컨텍스트를 분석하고 있습니다..." },
    { threshold: 20, label: "제품 비전을 수립하고 있습니다..." },
    { threshold: 45, label: "PRD 각 섹션을 작성하고 있습니다..." },
    { threshold: 70, label: "KPI와 리스크를 정리하고 있습니다..." },
    { threshold: 90, label: "마무리 검토 중..." },
  ],
  questions: [
    { threshold: 0,  label: "프로젝트 맥락을 파악하고 있습니다..." },
    { threshold: 30, label: "핵심 질문을 구성하고 있습니다..." },
    { threshold: 65, label: "선택지를 정리하고 있습니다..." },
    { threshold: 85, label: "마무리 검토 중..." },
  ],
  features: [
    { threshold: 0,  label: "PRD를 기반으로 기능을 파악하고 있습니다..." },
    { threshold: 25, label: "카테고리를 분류하고 있습니다..." },
    { threshold: 50, label: "기능별 우선순위를 정하고 있습니다..." },
    { threshold: 75, label: "하위 기능을 구성하고 있습니다..." },
    { threshold: 90, label: "마무리 검토 중..." },
  ],
  workflow: [
    { threshold: 0,  label: "핵심 사용자 시나리오를 파악하고 있습니다..." },
    { threshold: 25, label: "워크플로우 노드를 설계하고 있습니다..." },
    { threshold: 55, label: "분기와 흐름을 연결하고 있습니다..." },
    { threshold: 80, label: "엣지 케이스를 점검하고 있습니다..." },
    { threshold: 92, label: "마무리 검토 중..." },
  ],
};

function getCurrentStageLabel(type: string, progress: number): string {
  const stages = STAGES[type] ?? STAGES.prd;
  // 현재 progress 이하의 마지막 단계 라벨 반환
  let label = stages[0].label;
  for (const s of stages) {
    if (progress >= s.threshold) label = s.label;
  }
  return label;
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────
interface Props {
  type: "analysis" | "prd" | "questions" | "features" | "workflow";
  active: boolean;  // 생성 중 여부
  done: boolean;    // 완료 여부
  streamText?: string; // SSE 스트림 텍스트 (옵션)
}

export default function GeneratingProgress({ type, active, done, streamText = "" }: Props) {
  const [progress, setProgress] = useState(0);

  // 시뮬레이션 진행률: 0→95% 까지 부드럽게, 완료 시 100%
  useEffect(() => {
    if (!active) {
      setProgress(0);
      return;
    }
    if (done) {
      setProgress(100);
      return;
    }

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return prev;
        // 초반 빠르게, 후반 느리게
        const inc = prev < 30 ? 2.5 : prev < 60 ? 1.2 : prev < 82 ? 0.6 : 0.2;
        return Math.min(95, prev + inc);
      });
    }, 280);

    return () => clearInterval(interval);
  }, [active, done]);

  // 스트림에서 마지막 의미있는 줄 추출 (AI thinking 미리보기)
  const thinkingPreview = streamText
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 4)
    .slice(-1)[0] ?? "";

  const stageLabel = done ? "완료!" : getCurrentStageLabel(type, progress);
  const displayProgress = done ? 100 : Math.round(progress);

  if (!active && !done) return null;

  return (
    <div className="space-y-3">
      {/* 단계 메시지 + 퍼센트 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {done ? (
            <span className="w-2 h-2 rounded-full bg-green-500" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          )}
          <span className="text-sm text-zinc-300">{stageLabel}</span>
        </div>
        <span className="text-xs font-mono text-zinc-500">{displayProgress}%</span>
      </div>

      {/* 진행률 바 */}
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${done ? "bg-green-500" : "bg-blue-500"}`}
          style={{ width: `${displayProgress}%` }}
        />
      </div>

      {/* AI thinking 미리보기 (스트림 텍스트) */}
      {!done && thinkingPreview && (
        <div className="mt-1 px-3 py-2 bg-zinc-900 rounded-lg border border-zinc-800">
          <p className="text-xs text-zinc-600 font-mono truncate">
            <span className="text-zinc-700 mr-2">AI›</span>
            {thinkingPreview}
          </p>
        </div>
      )}
    </div>
  );
}
