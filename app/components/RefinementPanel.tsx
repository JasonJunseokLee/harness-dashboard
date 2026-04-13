"use client";

import { useState } from "react";

// ─── 타입 ───────────────────────────────────────────────────────
interface RefinementPanelProps {
  onRefine: (instruction: string) => Promise<void>;
  isRefining: boolean;
  progressText: string;
  error?: string | null;  // 에러 메시지 (선택사항)
  presets?: string[];     // phase별 프리셋 (기본: claude-md 프리셋)
}

// ─── 수정 지시사항 입력 패널 ────────────────────────────────────
export default function RefinementPanel({
  onRefine,
  isRefining,
  progressText,
  error,
  presets: customPresets,
}: RefinementPanelProps) {
  const [instruction, setInstruction] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instruction.trim() || isRefining) return;
    await onRefine(instruction.trim());
    setInstruction("");
  };

  // 빠른 선택 프리셋 (props로 받은 것 사용, 아니면 기본값)
  const presets = customPresets ?? [
    "한글 주석을 더 자세히",
    "테스트 섹션 추가",
    "Definition of Done 강화",
    "금지 패턴 섹션 추가",
  ];

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
      <h3 className="text-zinc-100 font-semibold mb-3 text-sm">AI 수정 요청</h3>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* 프리셋 버튼 */}
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setInstruction(preset)}
              disabled={isRefining}
              className="text-xs px-2 py-1 bg-zinc-800 text-zinc-400 rounded hover:bg-zinc-700 hover:text-zinc-300 transition-colors disabled:opacity-50"
            >
              {preset}
            </button>
          ))}
        </div>

        {/* 텍스트 입력 */}
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="예: '색상 토큰 섹션 추가' 또는 '에러 처리 규칙을 더 엄격하게'"
          disabled={isRefining}
          rows={3}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 text-sm p-3 placeholder-zinc-600 disabled:opacity-50 focus:outline-none focus:border-zinc-500 resize-none"
        />

        {/* 제출 버튼 */}
        <button
          type="submit"
          disabled={!instruction.trim() || isRefining}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isRefining ? "수정 중..." : "수정 요청"}
        </button>
      </form>

      {/* 에러 표시 */}
      {error && (
        <div className="mt-3 bg-red-950 border border-red-800 rounded-xl p-3 text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* 진행 상황 */}
      {isRefining && progressText && (
        <div className="mt-3 p-3 bg-zinc-800 rounded-lg border border-zinc-700">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse" />
            <p className="text-xs text-zinc-500">스트리밍 중...</p>
          </div>
          <div className="text-xs text-zinc-400 font-mono max-h-[150px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
            {progressText.slice(-500)}
          </div>
        </div>
      )}
    </div>
  );
}
