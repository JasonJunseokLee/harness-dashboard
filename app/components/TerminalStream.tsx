"use client";

import { useEffect, useRef } from "react";

// ─── 터미널 스타일 스트리밍 뷰어 ──────────────────────────────
// claude -p 의 실제 출력을 그대로 보여줍니다.
// GeneratingProgress(하드코딩 단계) 대신 이 컴포넌트를 사용하세요.

interface Props {
  streamText: string; // SSE로 받은 누적 텍스트
  done: boolean;      // 완료 여부
  active: boolean;    // 생성 중 여부
  height?: string;    // 터미널 높이 (기본 h-64)
}

export default function TerminalStream({ streamText, done, active, height = "h-64" }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 새 텍스트가 올 때마다 자동으로 맨 아래로 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamText]);

  if (!active && !done) return null;

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
        className={`${height} overflow-y-auto bg-[#0d0d0d] border border-zinc-800 rounded-lg p-4 font-mono text-xs text-zinc-300 leading-relaxed`}
      >
        <pre className="whitespace-pre-wrap break-words">
          {streamText || (
            <span className="text-zinc-600">claude -p 실행 중, 잠시 기다려주세요...</span>
          )}
          {/* 커서 블링크 (생성 중일 때만) */}
          {!done && streamText && (
            <span className="inline-block w-[7px] h-[13px] bg-zinc-400 ml-0.5 animate-pulse align-text-bottom" />
          )}
        </pre>
      </div>
    </div>
  );
}
