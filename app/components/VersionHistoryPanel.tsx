"use client";

import { useState, useEffect } from "react";

// ─── 타입 ───────────────────────────────────────────────────────
interface VersionItem {
  v: string;
  timestamp: string;
  source: string;
  size: number;
  lines: number;
  instruction: string | null;
  preview: string;
}

interface VersionHistoryPanelProps {
  phase: string; // 🆕 phase 식별자 (예: "prd", "sprint-plan", "claude-md")
  onSelectVersion: (version: string, content: string) => void;
  onRestore: (version: string) => Promise<void>;
  currentVersion: string;
  refreshTrigger: number; // 버전 목록 새로고침 트리거
}

// ─── 버전 히스토리 사이드 패널 ──────────────────────────────────
export default function VersionHistoryPanel({
  phase,
  onSelectVersion,
  onRestore,
  currentVersion,
  refreshTrigger,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restoringVersion, setRestoringVersion] = useState<string | null>(null);

  // 버전 목록 로드
  useEffect(() => {
    fetchVersions();
  }, [refreshTrigger, phase]); // phase 변경 시에도 새로고침

  const fetchVersions = async () => {
    try {
      setIsLoading(true);
      // 🆕 phase를 URL에 동적으로 포함
      const res = await fetch(`/api/ai-results/${phase}/versions`);
      if (!res.ok) throw new Error("버전 목록 로드 실패");
      const data = await res.json();
      setVersions(data.versions ?? []);
    } catch (err) {
      console.error("버전 목록 로드 실패:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // 버전 선택 시 전체 내용 조회
  const handleSelect = async (v: string) => {
    try {
      // 🆕 phase를 URL에 동적으로 포함
      const res = await fetch(`/api/ai-results/${phase}/versions/${v}`);
      if (!res.ok) throw new Error("버전 조회 실패");
      const data = await res.json();
      onSelectVersion(v, data.content);
    } catch (err) {
      console.error("버전 조회 실패:", err);
    }
  };

  // 버전 복원
  const handleRestore = async (v: string) => {
    setRestoringVersion(v);
    try {
      await onRestore(v);
    } finally {
      setRestoringVersion(null);
    }
  };

  // source 라벨 한글 변환
  const sourceLabel = (source: string) => {
    switch (source) {
      case "initial": return "초기 생성";
      case "user_refinement": return "수정";
      case "user_edit": return "직접 편집";
      case "restore": return "복원";
      default: return source;
    }
  };

  // 파일 크기 포맷
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    return `${(bytes / 1024).toFixed(1)}KB`;
  };

  if (isLoading) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
        <h3 className="text-zinc-100 font-semibold mb-4 text-sm">버전 히스토리</h3>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-zinc-800 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
        <h3 className="text-zinc-100 font-semibold mb-4 text-sm">버전 히스토리</h3>
        <p className="text-zinc-600 text-xs text-center py-4">
          아직 저장된 버전이 없습니다
        </p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
      <h3 className="text-zinc-100 font-semibold mb-4 text-sm">
        버전 히스토리
        <span className="ml-2 text-zinc-600 font-normal">({versions.length})</span>
      </h3>

      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
        {versions.map((v) => (
          <div
            key={v.v}
            className={`
              p-3 rounded-lg border cursor-pointer transition-colors
              ${currentVersion === v.v
                ? "bg-zinc-800 border-zinc-600"
                : "bg-zinc-900 border-zinc-800 hover:bg-zinc-800/60 hover:border-zinc-700"}
            `}
            onClick={() => handleSelect(v.v)}
          >
            {/* 헤더: 버전 번호 + 복원 버튼 */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-zinc-100 font-mono text-xs font-medium">
                  {v.v}
                </span>
                {currentVersion === v.v && (
                  <span className="text-[10px] bg-blue-600/20 text-blue-400 px-1.5 py-0.5 rounded">
                    현재
                  </span>
                )}
                <span className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">
                  {sourceLabel(v.source)}
                </span>
              </div>
              {currentVersion !== v.v && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRestore(v.v);
                  }}
                  disabled={restoringVersion === v.v}
                  className="text-[10px] text-zinc-500 hover:text-blue-400 transition-colors disabled:opacity-50"
                >
                  {restoringVersion === v.v ? "복원 중..." : "복원"}
                </button>
              )}
            </div>

            {/* 메타 정보 */}
            <p className="text-[10px] text-zinc-600 mt-1.5">
              {new Date(v.timestamp).toLocaleString("ko-KR")} · {v.lines}줄 · {formatSize(v.size)}
            </p>

            {/* 수정 지시사항 */}
            {v.instruction && (
              <p className="text-[10px] text-zinc-500 mt-1.5 italic leading-relaxed truncate">
                &ldquo;{v.instruction}&rdquo;
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
