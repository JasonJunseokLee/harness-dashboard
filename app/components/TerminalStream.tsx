"use client";

import { useEffect, useRef, useState } from "react";

// ─── 터미널 스타일 스트리밍 뷰어 ──────────────────────────────
// claude의 thinking(추론) + 실제 출력을 실시간으로 보여줍니다.

interface Props {
  streamText: string;    // 실제 출력 (누적)
  thinkingText?: string; // Claude의 추론 과정 (누적, optional)
  done: boolean;
  active: boolean;
  height?: string;
}

export default function TerminalStream({ streamText, thinkingText, done, active, height = "h-64" }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const thinkingRef = useRef<HTMLDivElement>(null);
  const [thinkingOpen, setThinkingOpen] = useState(true); // 기본 펼침

  // 출력 텍스트 스크롤
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [streamText]);

  // 추론 텍스트 스크롤
  useEffect(() => {
    if (thinkingRef.current) thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
  }, [thinkingText]);

  // 실제 출력이 시작되면 thinking 자동 접기
  useEffect(() => {
    if (streamText && thinkingText) setThinkingOpen(false);
  }, [streamText, thinkingText]);

  if (!active && !done) return null;

  // ▸ 로 시작하는 줄 = 상태 메시지 (dim), 그 외 = 실제 출력
  const renderLines = (text: string, dimAll = false) =>
    text.split("\n").map((line, i) => (
      <span key={i} className={dimAll || line.startsWith("▸ ") ? "text-zinc-600" : "text-zinc-300"}>
        {line}{"\n"}
      </span>
    ));

  const hasThinking = !!thinkingText;
  const hasOutput = !!streamText;

  return (
    <div className="space-y-2">
      {/* 상태 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {done
            ? <span className="w-2 h-2 rounded-full bg-green-500" />
            : <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          }
          <span className="text-xs text-zinc-500 font-mono">
            {done ? "완료"
              : hasOutput ? "출력 중..."
              : hasThinking ? "추론 중..."
              : "시작 중..."}
          </span>
        </div>
        {done && <span className="text-xs text-green-600 font-mono">✓ done</span>}
      </div>

      {/* ── Thinking 블록 (접기/펼치기) ── */}
      {hasThinking && (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-3 py-2 bg-zinc-900/80 hover:bg-zinc-800/60 transition-colors"
            onClick={() => setThinkingOpen(v => !v)}
          >
            <div className="flex items-center gap-2">
              {/* 추론 중일 때 pulse, 완료 후엔 정적 */}
              <span className={`text-sm ${!done && !hasOutput ? "animate-pulse" : ""}`}>🤔</span>
              <span className="text-xs text-zinc-500 font-mono">
                {done || hasOutput ? "추론 과정" : "추론 중..."}
              </span>
              <span className="text-xs text-zinc-700">
                ({thinkingText.length.toLocaleString()} chars)
              </span>
            </div>
            <span className="text-zinc-600 text-xs">{thinkingOpen ? "▲" : "▼"}</span>
          </button>

          {thinkingOpen && (
            <div
              ref={thinkingRef}
              className="max-h-48 overflow-y-auto bg-[#0a0a0a] px-4 py-3 font-mono text-xs leading-relaxed"
            >
              <pre className="whitespace-pre-wrap break-words text-zinc-600 italic">
                {renderLines(thinkingText, true)}
                {!done && !hasOutput && (
                  <span className="inline-block w-[7px] h-[13px] bg-zinc-700 ml-0.5 animate-pulse align-text-bottom" />
                )}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ── 실제 출력 터미널 ── */}
      <div
        ref={scrollRef}
        className={`${height} overflow-y-auto bg-[#0d0d0d] border border-zinc-800 rounded-lg p-4 font-mono text-xs leading-relaxed`}
      >
        <pre className="whitespace-pre-wrap break-words">
          {hasOutput ? (
            <>
              {renderLines(streamText)}
              {!done && (
                <span className="inline-block w-[7px] h-[13px] bg-zinc-400 ml-0.5 animate-pulse align-text-bottom" />
              )}
            </>
          ) : (
            <span className="text-zinc-700">
              {hasThinking ? "추론 완료 후 출력 시작..." : "시작 중..."}
            </span>
          )}
        </pre>
      </div>
    </div>
  );
}
