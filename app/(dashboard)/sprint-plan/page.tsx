"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import TerminalStream from "@/app/components/TerminalStream";
import InstructionInput from "@/app/components/InstructionInput";
import RefinementPanel from "@/app/components/RefinementPanel";
import VersionHistoryPanel from "@/app/components/VersionHistoryPanel";
import VersionDiffViewer from "@/app/components/VersionDiffViewer";
import { useAIRefinement } from "@/app/lib/useAIRefinement";

// ─── 타입 ─────────────────────────────────────────────────────
type MemoryFile = {
  name: string;
  label: string;
  type: string;
  description: string;
  body: string;
  updatedAt: string;
};

// 메모리 타입별 색상
const TYPE_COLOR: Record<string, string> = {
  user:     "text-blue-400 bg-blue-950 border-blue-900",
  feedback: "text-amber-400 bg-amber-950 border-amber-900",
  project:  "text-green-400 bg-green-950 border-green-900",
  reference:"text-purple-400 bg-purple-950 border-purple-900",
};

const TYPE_LABEL: Record<string, string> = {
  user: "사용자", feedback: "피드백", project: "프로젝트", reference: "레퍼런스",
};

// 날짜 포맷
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ─── 스프린트 플랜 프리셋 ──────────────────────────────────────
const SPRINT_PRESETS = [
  "기간을 2주로 조정",
  "우선순위 조정",
  "리스크 완화 계획 추가",
];

// ─── 메인 페이지 ──────────────────────────────────────────────
export default function SprintPlanPage() {
  // ── 스프린트 플랜 상태 ──────────────────────────────────────
  const [sprintPlan, setSprintPlan] = useState("");
  const [sprintExists, setSprintExists] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genDone, setGenDone] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [instruction, setInstruction] = useState("");

  // 이전 버전
  const [prevPlan, setPrevPlan] = useState("");
  const [viewingPrev, setViewingPrev] = useState(false);

  // AI 수정 기능 (diff 뷰어용)
  const [showDiff, setShowDiff] = useState(false);
  const [diffV1, setDiffV1] = useState("");
  const [diffV2, setDiffV2] = useState("");

  // useAIRefinement 훅 통합 (마크다운 형식)
  const {
    handleRefine,
    handleRestore,
    handleSelectVersion,
    isRefining,
    refineProgress,
    currentVersion,
    versionRefresh,
    error: refinementError,
  } = useAIRefinement({
    phase: "sprint-plan",
    format: "markdown",
    currentContent: sprintPlan,
    onContentChange: setSprintPlan,
  });

  // ── 메모리 상태 ────────────────────────────────────────────
  const [memoryFiles, setMemoryFiles] = useState<MemoryFile[]>([]);
  const [memoryDir, setMemoryDir] = useState("");
  const [selectedMemory, setSelectedMemory] = useState<MemoryFile | null>(null);
  const memPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 초기 로드 ──────────────────────────────────────────────
  useEffect(() => {
    // 스프린트 플랜
    fetch("/api/setup/sprint-plan")
      .then(r => r.json())
      .then(d => { if (d.exists) { setSprintPlan(d.content); setSprintExists(true); } });
    // 이전 버전
    fetch("/api/setup/sprint-plan?prev=true")
      .then(r => r.json())
      .then(d => { if (d.exists) setPrevPlan(d.content); });
    // 초기 버전 정보 로드 (useAIRefinement 내부에서 사용)
    fetch("/api/ai-results/sprint-plan/versions")
      .then(r => r.json())
      .catch(() => {});
    // 메모리
    loadMemory();
  }, []);

  // ── 메모리 폴링 (3초 간격) ──────────────────────────────────
  useEffect(() => {
    memPollRef.current = setInterval(loadMemory, 3000);
    return () => { if (memPollRef.current) clearInterval(memPollRef.current); };
  }, []);

  async function loadMemory() {
    const d = await fetch("/api/memory").then(r => r.json()).catch(() => null);
    if (!d) return;
    setMemoryDir(d.memoryDir ?? "");
    setMemoryFiles(prev => {
      // 새 파일이 있으면 업데이트, 없으면 기존 유지
      const same = JSON.stringify(prev) === JSON.stringify(d.files);
      return same ? prev : d.files;
    });
  }

  // ── 생성 ───────────────────────────────────────────────────
  async function generate() {
    // 현재 내용을 이전 버전으로 백업
    if (sprintPlan) setPrevPlan(sprintPlan);
    setGenerating(true);
    setGenDone(false);
    setStreamText("");
    setSprintPlan("");
    setViewingPrev(false);

    let full = "";
    const res = await fetch("/api/setup/sprint-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction }),
    });
    if (!res.ok || !res.body) { setGenerating(false); return; }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value).split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (!json) continue;
        const ev = JSON.parse(json);
        if (ev.type === "text") { full += ev.text; setStreamText(p => p + ev.text); }
        if (ev.type === "done") { setSprintPlan(full); setSprintExists(true); setGenDone(true); }
      }
    }
    setGenerating(false);
  }

  // ── 이전 버전 복원 ─────────────────────────────────────────
  async function restorePrev() {
    if (!prevPlan) return;
    await fetch("/api/setup/sprint-plan", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: prevPlan }),
    });
    setSprintPlan(prevPlan);
    setViewingPrev(false);
  }

  const displayContent = viewingPrev ? prevPlan : sprintPlan;

  // ─── 렌더링 ────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">

      {/* ── 메인 영역 ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full py-10 px-6 space-y-5">

          {/* 헤더 */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">스프린트 플랜</h1>
              <p className="text-zinc-500 text-sm mt-1">
                기능 명세·워크플로우 기반으로 실행 가능한 스프린트를 구성합니다
              </p>
            </div>
            <div className="flex gap-2 shrink-0 mt-1">
              {prevPlan && !viewingPrev && (
                <button
                  onClick={() => setViewingPrev(true)}
                  className="px-3 py-2 border border-amber-900 text-amber-500 hover:border-amber-700 rounded-lg text-sm transition-colors"
                >
                  ↩ 이전 버전
                </button>
              )}
              {sprintExists && !generating && (
                <button
                  onClick={generate}
                  className="px-3 py-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 rounded-lg text-sm transition-colors"
                >
                  재생성
                </button>
              )}
              {!sprintExists && !generating && (
                <button
                  onClick={generate}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  스프린트 플랜 생성
                </button>
              )}
            </div>
          </div>

          {/* 지시사항 */}
          <InstructionInput
            value={instruction}
            onChange={setInstruction}
            disabled={generating}
            placeholder="예: 스프린트를 2주 단위로 잡아줘. MVP 범위를 2개 스프린트로 제한해줘."
          />

          {/* 이전 버전 배너 */}
          {viewingPrev && (
            <div className="bg-amber-950 border border-amber-800 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-amber-400 text-sm">이전 버전을 보고 있습니다</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setViewingPrev(false)}
                  className="px-3 py-1.5 text-xs border border-amber-800 text-amber-500 rounded-lg hover:border-amber-600 transition-colors"
                >
                  현재 버전으로
                </button>
                <button
                  onClick={restorePrev}
                  className="px-3 py-1.5 text-xs bg-amber-700 hover:bg-amber-600 text-white rounded-lg transition-colors"
                >
                  이 버전으로 복원
                </button>
              </div>
            </div>
          )}

          {/* 생성 중 터미널 */}
          {(generating || genDone) && (
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
              <TerminalStream
                active={generating || genDone}
                done={genDone}
                streamText={streamText}
                height="h-48"
              />
            </div>
          )}

          {/* ── 2칼럼 레이아웃: 콘텐츠 + 사이드 패널 ── */}
          {displayContent && !generating && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
              {/* 왼쪽: 스프린트 플랜 콘텐츠 */}
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                <pre className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed font-mono">
                  {displayContent}
                </pre>
              </div>

              {/* 오른쪽: 수정 + 버전 관리 패널 */}
              {!viewingPrev && (
                <div className="space-y-4">
                  {/* AI 수정 요청 패널 */}
                  <RefinementPanel
                    onRefine={handleRefine}
                    isRefining={isRefining}
                    progressText={refineProgress}
                    presets={SPRINT_PRESETS}
                  />

                  {/* 버전 히스토리 패널 */}
                  <VersionHistoryPanel
                    phase="sprint-plan"
                    onSelectVersion={handleSelectVersion}
                    onRestore={handleRestore}
                    currentVersion={currentVersion}
                    refreshTrigger={versionRefresh}
                  />

                  {/* Diff 뷰어 */}
                  {showDiff && diffV1 && diffV2 && (
                    <VersionDiffViewer
                      phase="sprint-plan"
                      v1={diffV1}
                      v2={diffV2}
                      onClose={() => setShowDiff(false)}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* 빈 상태 */}
          {!sprintExists && !generating && (
            <div className="text-center py-20 text-zinc-600">
              <p className="text-3xl mb-3">🗓️</p>
              <p className="text-sm">생성 버튼을 눌러 시작하세요</p>
              <p className="text-xs mt-1">기능 명세서와 워크플로우가 완성된 후 생성하면 더 정확합니다</p>
            </div>
          )}
        </div>
      </div>

      {/* ── 우측 메모리 패널 ──────────────────────────────── */}
      <div className="w-72 shrink-0 border-l border-zinc-800 bg-zinc-900 flex flex-col h-screen sticky top-0">

        {/* 패널 헤더 */}
        <div className="px-4 py-4 border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold text-zinc-300 uppercase tracking-widest">
                메모리
              </h2>
              <p className="text-[10px] text-zinc-600 mt-0.5">Claude 세션 간 학습 내용</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-zinc-600">폴링 중</span>
            </div>
          </div>
        </div>

        {/* 메모리 파일 목록 */}
        <div className="flex-1 overflow-y-auto">
          {memoryFiles.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-zinc-600">아직 저장된 메모리가 없습니다</p>
              <p className="text-[10px] text-zinc-700 mt-2 leading-relaxed">
                Claude Code 작업 중 중요한 내용이<br />
                자동으로 여기에 표시됩니다
              </p>
              {memoryDir && (
                <p className="text-[10px] text-zinc-800 mt-3 font-mono break-all">
                  {memoryDir}
                </p>
              )}
            </div>
          ) : (
            <div className="py-2">
              {memoryFiles.map((f) => {
                const colorClass = TYPE_COLOR[f.type] ?? TYPE_COLOR.project;
                const isSelected = selectedMemory?.name === f.name;
                return (
                  <button
                    key={f.name}
                    onClick={() => setSelectedMemory(isSelected ? null : f)}
                    className={`w-full text-left px-4 py-3 border-b border-zinc-800/60 hover:bg-zinc-800/50 transition-colors ${isSelected ? "bg-zinc-800" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 mt-0.5 ${colorClass}`}>
                        {TYPE_LABEL[f.type] ?? f.type}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs text-zinc-300 font-medium leading-snug truncate">
                          {f.label}
                        </p>
                        {f.description && (
                          <p className="text-[10px] text-zinc-600 mt-0.5 leading-snug line-clamp-2">
                            {f.description}
                          </p>
                        )}
                        <p className="text-[10px] text-zinc-700 mt-1">{fmtDate(f.updatedAt)}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 선택된 메모리 상세 */}
        {selectedMemory && (
          <div className="border-t border-zinc-800 px-4 py-4 max-h-64 overflow-y-auto bg-zinc-950">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-zinc-300">{selectedMemory.label}</p>
              <button
                onClick={() => setSelectedMemory(null)}
                className="text-zinc-600 hover:text-zinc-400 text-xs"
              >
                ✕
              </button>
            </div>
            <pre className="text-[11px] text-zinc-400 whitespace-pre-wrap leading-relaxed font-mono">
              {selectedMemory.body}
            </pre>
          </div>
        )}

        {/* 메모리 경로 */}
        {memoryDir && memoryFiles.length > 0 && (
          <div className="px-4 py-2 border-t border-zinc-800">
            <p className="text-[9px] text-zinc-700 font-mono break-all leading-relaxed">
              {memoryDir}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
