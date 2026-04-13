"use client";

import { useEffect, useRef } from "react";

// ─── 터미널 스타일 스트리밍 뷰어 ──────────────────────────────
// claude -p 의 실제 출력을 그대로 보여줍니다.
// ▸ 로 시작하는 줄은 claude의 상태 메시지 (dim 색으로 표시)

interface Props {
  streamText: string; // SSE로 받은 누적 텍스트
  done: boolean;      // 완료 여부
  active: boolean;    // 생성 중 여부
  height?: string;    // 터미널 높이 (기본 h-64)
}

export default function TerminalStream({ streamText, done, active, height = "h-64" }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamText]);

  if (!active && !done) return null;

  // ▸ 로 시작하는 줄 = claude 상태 메시지 → dim 색 / 그 외 = 실제 출력 → 밝은 색
  const renderLines = (text: string) => {
    if (!text) return null;
    return text.split("\n").map((line, i) => {
      const isStatus = line.startsWith("▸ ");
      return (
        <span
          key={i}
          className={isStatus ? "text-zinc-600" : "text-zinc-300"}
        >
          {line}
          {"\n"}
        </span>
      );
    });
  };

  return (
    <div className="space-y-2">
      {/* 상태 표시 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {done ? (
            <span className="w-2 h-2 rounded-full bg-green-500" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          )}
          <span className="text-xs text-zinc-500 font-mono">
            {done ? "완료" : "claude 실행 중..."}
          </span>
        </div>
        {done && (
          <span className="text-xs text-green-600 font-mono">✓ done</span>
        )}
      </div>

      {/* 터미널 패널 */}
      <div
        ref={scrollRef}
        className={`${height} overflow-y-auto bg-[#0d0d0d] border border-zinc-800 rounded-lg p-4 font-mono text-xs leading-relaxed`}
      >
        <pre className="whitespace-pre-wrap break-words">
          {streamText ? (
            <>
              {renderLines(streamText)}
              {/* 커서 블링크 (생성 중일 때만) */}
              {!done && (
                <span className="inline-block w-[7px] h-[13px] bg-zinc-400 ml-0.5 animate-pulse align-text-bottom" />
              )}
            </>
          ) : (
            <span className="text-zinc-600">claude -p 실행 중, 잠시 기다려주세요...</span>
          )}
        </pre>
      </div>
    </div>
  );
}
