"use client";

import { useState, useEffect } from "react";

// ─── 타입 ───────────────────────────────────────────────────────
interface DiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
  lineNumber?: number;
}

interface DiffResult {
  v1: string;
  v2: string;
  hunks: DiffLine[];
  stats: { added: number; removed: number; unchanged: number };
}

interface VersionDiffViewerProps {
  phase: string; // 🆕 phase 식별자
  v1: string;
  v2: string;
  onClose: () => void;
}

// ─── 버전 비교 뷰어 ────────────────────────────────────────────
export default function VersionDiffViewer({ phase, v1, v2, onClose }: VersionDiffViewerProps) {
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDiff = async () => {
      try {
        setIsLoading(true);
        setError(null);
        // 🆕 phase를 URL에 동적으로 포함
        const res = await fetch(`/api/ai-results/${phase}/diff`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ v1, v2 }),
        });
        if (!res.ok) throw new Error("diff 로드 실패");
        const data = await res.json();
        setDiff(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "diff 로드 실패");
      } finally {
        setIsLoading(false);
      }
    };
    fetchDiff();
  }, [phase, v1, v2]); // phase 의존성 추가

  // diff 줄 스타일
  const lineStyle = (type: DiffLine["type"]) => {
    switch (type) {
      case "added":
        return "bg-green-950/40 text-green-300 border-l-2 border-green-600";
      case "removed":
        return "bg-red-950/40 text-red-300 border-l-2 border-red-600";
      default:
        return "text-zinc-500 border-l-2 border-transparent";
    }
  };

  const linePrefix = (type: DiffLine["type"]) => {
    switch (type) {
      case "added": return "+";
      case "removed": return "-";
      default: return " ";
    }
  };

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-zinc-100 font-semibold text-sm">버전 비교</h3>
          <span className="text-xs text-zinc-500 font-mono">
            {v1} → {v2}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
        >
          닫기
        </button>
      </div>

      {/* 로딩 */}
      {isLoading && (
        <div className="py-8 text-center text-zinc-600 text-sm">비교 중...</div>
      )}

      {/* 에러 */}
      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-3 text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* diff 통계 */}
      {diff && (
        <>
          <div className="flex gap-4 mb-3 text-xs">
            <span className="text-green-400">+{diff.stats.added} 추가</span>
            <span className="text-red-400">-{diff.stats.removed} 삭제</span>
            <span className="text-zinc-600">{diff.stats.unchanged} 동일</span>
          </div>

          {/* diff 내용 */}
          <div className="max-h-[400px] overflow-y-auto rounded bg-zinc-950 border border-zinc-800">
            <pre className="text-xs font-mono leading-relaxed">
              {diff.hunks.map((line, i) => (
                <div
                  key={i}
                  className={`px-3 py-0.5 ${lineStyle(line.type)}`}
                >
                  <span className="inline-block w-4 text-zinc-600 select-none">
                    {linePrefix(line.type)}
                  </span>
                  {line.content}
                </div>
              ))}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
