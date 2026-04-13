"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import TerminalStream from "@/app/components/TerminalStream";
import RefinementPanel from "@/app/components/RefinementPanel";
import VersionHistoryPanel from "@/app/components/VersionHistoryPanel";
import VersionDiffViewer from "@/app/components/VersionDiffViewer";
import { useAIRefinement } from "@/app/lib/useAIRefinement";
import type { RalphConfig } from "@/app/api/ralph-loop/route";

// ─── 탭 타입 ─────────────────────────────────────────────────
type Tab = "design" | "run" | "status";

// ─── 모델 옵션 ────────────────────────────────────────────────
const MODELS = [
  { id: "claude-opus-4-6",    label: "Opus 4.6  (최고 품질)" },
  { id: "claude-sonnet-4-6",  label: "Sonnet 4.6 (균형)" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5  (빠름)" },
];

// ─── Ralph Loop 프리셋 ──────────────────────────────────────
const RALPH_LOOP_PRESETS = [
  "루프 조건 엄격하게",
  "실패 처리 추가",
  "성공 기준 명확화",
  "품질 게이트 강화",
];

// ─── SHIP/REVISE 이벤트 파싱 ─────────────────────────────────
type BulletinEvent = {
  type: "ship" | "revise" | "complete" | "summary" | "task";
  taskId?: string;
  iteration?: number;
  score?: number;
  text: string;
};

function parseBulletin(raw: string): BulletinEvent[] {
  const events: BulletinEvent[] = [];
  const lines = raw.split("\n");
  for (const line of lines) {
    if (line.includes("[TASK:")) {
      const m = line.match(/\[TASK:\s*([^\]]+)\]\s*(.+)/);
      events.push({ type: "task", taskId: m?.[1]?.trim(), text: m?.[2]?.trim() ?? line });
    } else if (line.includes("판정: SHIP")) {
      const scoreMatch = line.match(/(\d+\.?\d*)\s*\/\s*5/);
      events.push({ type: "ship", score: scoreMatch ? parseFloat(scoreMatch[1]) : undefined, text: line.trim() });
    } else if (line.includes("판정: REVISE") || line.includes("[FEEDBACK")) {
      const iterMatch = line.match(/#(\d+)/);
      events.push({ type: "revise", iteration: iterMatch ? parseInt(iterMatch[1]) : undefined, text: line.trim() });
    } else if (line.includes("[COMPLETE]")) {
      events.push({ type: "complete", text: line.trim() });
    } else if (line.includes("[SUMMARY]")) {
      events.push({ type: "summary", text: line.trim() });
    }
  }
  return events;
}

// ─── 태스크 아이템 컴포넌트 ──────────────────────────────────
function TaskItem({
  task,
  onChange,
  onRemove,
}: {
  task: { id: string; title: string; desc: string };
  onChange: (field: "title" | "desc", val: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-zinc-600 font-mono w-12 shrink-0">{task.id}</span>
        <input
          type="text"
          value={task.title}
          onChange={e => onChange("title", e.target.value)}
          placeholder="태스크 제목"
          className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none"
        />
        <button onClick={onRemove} className="text-zinc-700 hover:text-zinc-400 text-xs px-1">✕</button>
      </div>
      <textarea
        value={task.desc}
        onChange={e => onChange("desc", e.target.value)}
        placeholder="태스크 상세 설명 (선택)"
        rows={1}
        className="w-full bg-transparent text-xs text-zinc-500 placeholder-zinc-700 resize-none focus:outline-none leading-relaxed"
      />
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────
export default function RalphLoopPage() {
  const [tab, setTab] = useState<Tab>("design");

  // ── 설정 상태 ──────────────────────────────────────────────
  const [config, setConfig] = useState<RalphConfig>({
    topic: "",
    enabled: true,
    maxIterations: 3,
    shipThreshold: 4.0,
    reviewCriteria:
      "1. 요구사항을 100% 충족하는가\n2. 코드/결과물이 즉시 사용 가능한 수준인가\n3. 엣지케이스와 에러 처리가 포함됐는가\n4. 한글 주석이 충분히 작성됐는가\n5. 기존 패턴과 일관성이 있는가",
    qualityGates: "",
    leadModel: "claude-sonnet-4-6",
    tasks: [],
  });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  // ── 실행 상태 ──────────────────────────────────────────────
  const [running, setRunning] = useState(false);
  const [runDone, setRunDone] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [promptPreview, setPromptPreview] = useState(false);

  // ── 현황 상태 ──────────────────────────────────────────────
  const [bulletin, setBulletin] = useState("");
  const [bulletinEvents, setBulletinEvents] = useState<BulletinEvent[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // AI 수정 기능 (diff 뷰어용)
  const [showDiff, setShowDiff] = useState(false);
  const [diffV1, setDiffV1] = useState("");
  const [diffV2, setDiffV2] = useState("");

  // useAIRefinement 훅 통합 (JSON 형식)
  // config를 JSON 문자열로 직렬화하여 AI 수정 요청 시 전송
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
    phase: "ralph-loop",
    format: "json",
    currentContent: config,
    onContentChange: setConfig,
    // config 객체를 JSON 문자열로 직렬화
    serializer: (cfg: RalphConfig) => JSON.stringify(cfg, null, 2),
    // JSON 문자열을 config 객체로 파싱
    parser: (text: string) => {
      try {
        return JSON.parse(text) as RalphConfig;
      } catch (err) {
        throw new Error(`Ralph Loop 설정 파싱 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
      }
    },
  });

  // ── 초기 로드 ──────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/ralph-loop")
      .then(r => r.json())
      .then(d => {
        if (d.config) setConfig(d.config);
        setHasRun(d.hasRun ?? false);
      });
    loadBulletin();
  }, []);

  // ── bulletin 폴링 (3초) ─────────────────────────────────────
  useEffect(() => {
    pollRef.current = setInterval(loadBulletin, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function loadBulletin() {
    const d = await fetch("/api/ralph-loop?what=bulletin").then(r => r.json()).catch(() => null);
    if (!d) return;
    setBulletin(d.content ?? "");
    setBulletinEvents(parseBulletin(d.content ?? ""));
    if (d.status?.running === false && running) setRunning(false);
  }

  // ── 설정 저장 ──────────────────────────────────────────────
  async function saveConfig() {
    setSaving(true);
    await fetch("/api/ralph-loop", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
    setSavedMsg("저장됨 ✓");
    setTimeout(() => setSavedMsg(""), 2000);
  }

  // ── 태스크 관리 ────────────────────────────────────────────
  function addTask() {
    const id = `T${String(config.tasks.length + 1).padStart(2, "0")}`;
    setConfig(c => ({ ...c, tasks: [...c.tasks, { id, title: "", desc: "" }] }));
  }

  function updateTask(idx: number, field: "title" | "desc", val: string) {
    setConfig(c => {
      const tasks = [...c.tasks];
      tasks[idx] = { ...tasks[idx], [field]: val };
      return { ...c, tasks };
    });
  }

  function removeTask(idx: number) {
    setConfig(c => ({ ...c, tasks: c.tasks.filter((_, i) => i !== idx) }));
  }

  // 스프린트 플랜에서 태스크 가져오기
  async function importFromSprintPlan() {
    const d = await fetch("/api/setup/sprint-plan").then(r => r.json()).catch(() => null);
    if (!d?.content) return;
    // 체크박스 항목 추출 (- [ ] 형식)
    const checkboxes = (d.content as string)
      .split("\n")
      .filter((l: string) => l.trim().match(/^- \[[ x]\]/))
      .map((l: string) => l.trim().replace(/^- \[[ x]\]\s*/, ""))
      .slice(0, 20);
    if (!checkboxes.length) return;
    const newTasks = checkboxes.map((title: string, i: number) => ({
      id: `T${String(config.tasks.length + i + 1).padStart(2, "0")}`,
      title,
      desc: "",
    }));
    setConfig(c => ({ ...c, tasks: [...c.tasks, ...newTasks] }));
  }

  // ── 실행 ───────────────────────────────────────────────────
  async function runLoop() {
    setRunning(true);
    setRunDone(false);
    setStreamText("");
    setTab("run");

    // 설정 먼저 저장
    await fetch("/api/ralph-loop", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });

    const res = await fetch("/api/ralph-loop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    if (!res.ok || !res.body) { setRunning(false); return; }

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
        if (ev.type === "text") setStreamText(p => p + ev.text);
        if (ev.type === "done") { setRunDone(true); setHasRun(true); loadBulletin(); }
      }
    }
    setRunning(false);
  }

  // ─── 렌더링 ────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 py-10 px-4">
      <div className="max-w-4xl mx-auto">

        {/* 헤더 */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">Ralph Loop</h1>
              <p className="text-zinc-500 text-sm mt-1">
                Lead → Worker 리뷰-피드백-수정 반복 루프 설계 및 실행
              </p>
            </div>
            <div className="flex items-center gap-2">
              {savedMsg && <span className="text-xs text-green-500">{savedMsg}</span>}
              <button
                onClick={saveConfig}
                disabled={saving}
                className="px-4 py-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 rounded-lg text-sm transition-colors"
              >
                {saving ? "저장 중..." : "설정 저장"}
              </button>
              <button
                onClick={runLoop}
                disabled={running}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {running ? "실행 중..." : "▶ 루프 실행"}
              </button>
            </div>
          </div>
        </div>

        {/* 에러 메시지 */}
        {(refinementError) && (
          <div className="bg-red-950 border border-red-800 rounded-xl p-4 mb-6 text-red-300 text-sm">
            {refinementError}
          </div>
        )}

        {/* 탭 */}
        <div className="flex gap-1 mb-6 bg-zinc-900 rounded-lg p-1 border border-zinc-800">
          {([
            { key: "design", label: "설계" },
            { key: "run",    label: "실행" },
            { key: "status", label: "현황", badge: hasRun },
          ] as { key: Tab; label: string; badge?: boolean }[]).map(({ key, label, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === key ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {badge && <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />}
              {label}
            </button>
          ))}
        </div>

        {/* ── 탭: 설계 ── */}
        {tab === "design" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            {/* 왼쪽: 설계 폼 */}
            <div className="space-y-5">

            {/* 루프 목표 */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-3">
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                루프 목표 / 주제
              </label>
              <input
                type="text"
                value={config.topic}
                onChange={e => setConfig(c => ({ ...c, topic: e.target.value }))}
                placeholder="예: Sprint 2 — 사용자 인증 기능 구현 및 QA"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>

            {/* Ralph Loop 설정 */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                  Ralph Loop 설정
                </label>
                {/* 활성화 토글 */}
                <button
                  onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    config.enabled
                      ? "bg-blue-950 border-blue-800 text-blue-300"
                      : "bg-zinc-800 border-zinc-700 text-zinc-500"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${config.enabled ? "bg-blue-400" : "bg-zinc-600"}`} />
                  {config.enabled ? "활성화" : "비활성화"}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* 최대 반복 횟수 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">최대 반복 횟수</span>
                    <span className="text-sm font-mono text-zinc-300">{config.maxIterations}회</span>
                  </div>
                  <input
                    type="range" min={1} max={10} step={1}
                    value={config.maxIterations}
                    onChange={e => setConfig(c => ({ ...c, maxIterations: parseInt(e.target.value) }))}
                    className="w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-700">
                    <span>1회</span><span>5회</span><span>10회</span>
                  </div>
                </div>

                {/* SHIP 기준 점수 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">SHIP 기준 점수</span>
                    <span className="text-sm font-mono text-zinc-300">{config.shipThreshold.toFixed(1)}/5.0</span>
                  </div>
                  <input
                    type="range" min={1.0} max={5.0} step={0.5}
                    value={config.shipThreshold}
                    onChange={e => setConfig(c => ({ ...c, shipThreshold: parseFloat(e.target.value) }))}
                    className="w-full accent-green-500"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-700">
                    <span>1.0</span><span>3.0</span><span>5.0</span>
                  </div>
                </div>
              </div>

              {/* Lead 모델 */}
              <div className="space-y-2">
                <span className="text-xs text-zinc-500">Lead 에이전트 모델</span>
                <div className="flex gap-2">
                  {MODELS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setConfig(c => ({ ...c, leadModel: m.id }))}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs transition-colors border ${
                        config.leadModel === m.id
                          ? "bg-zinc-700 border-zinc-500 text-zinc-100"
                          : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* SHIP 평가 기준 */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-3">
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                SHIP 평가 기준
                <span className="ml-2 text-zinc-700 normal-case font-normal tracking-normal">
                  (이 기준을 충족하면 SHIP ✓, 미충족이면 REVISE ✗)
                </span>
              </label>
              <textarea
                value={config.reviewCriteria}
                onChange={e => setConfig(c => ({ ...c, reviewCriteria: e.target.value }))}
                rows={5}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-zinc-500 resize-none font-mono leading-relaxed"
              />
            </div>

            {/* 추가 품질 게이트 */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-3">
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                추가 품질 게이트
                <span className="ml-2 text-zinc-700 normal-case font-normal tracking-normal">(선택)</span>
              </label>
              <textarea
                value={config.qualityGates}
                onChange={e => setConfig(c => ({ ...c, qualityGates: e.target.value }))}
                rows={3}
                placeholder="예: 빌드 오류 0개, 타입 에러 0개, 테스트 커버리지 80% 이상"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-zinc-500 resize-none leading-relaxed"
              />
            </div>

            {/* 태스크 목록 */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                  태스크 목록
                  <span className="ml-2 text-zinc-600 normal-case font-normal tracking-normal">
                    {config.tasks.length}개
                  </span>
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={importFromSprintPlan}
                    className="px-3 py-1.5 text-xs border border-zinc-700 hover:border-zinc-500 text-zinc-400 rounded-lg transition-colors"
                  >
                    스프린트 플랜에서 가져오기
                  </button>
                  <button
                    onClick={addTask}
                    className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                  >
                    + 태스크 추가
                  </button>
                </div>
              </div>

              {config.tasks.length === 0 ? (
                <div className="text-center py-8 text-zinc-700 text-xs">
                  태스크를 추가하거나 스프린트 플랜에서 가져오세요
                </div>
              ) : (
                <div className="space-y-2">
                  {config.tasks.map((task, idx) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onChange={(field, val) => updateTask(idx, field, val)}
                      onRemove={() => removeTask(idx)}
                    />
                  ))}
                </div>
              )}
            </div>
            </div>

            {/* 오른쪽: AI 수정 + 버전 관리 패널 */}
            <div className="space-y-4">
              {/* AI 수정 요청 패널 */}
              <RefinementPanel
                onRefine={handleRefine}
                isRefining={isRefining}
                progressText={refineProgress}
                presets={RALPH_LOOP_PRESETS}
              />

              {/* 버전 히스토리 패널 */}
              <VersionHistoryPanel
                phase="ralph-loop"
                onSelectVersion={handleSelectVersion}
                onRestore={handleRestore}
                currentVersion={currentVersion}
                refreshTrigger={versionRefresh}
              />

              {/* Diff 뷰어 */}
              {showDiff && diffV1 && diffV2 && (
                <VersionDiffViewer
                  phase="ralph-loop"
                  v1={diffV1}
                  v2={diffV2}
                  onClose={() => setShowDiff(false)}
                />
              )}
            </div>
          </div>
        )}

        {/* ── 탭: 실행 ── */}
        {tab === "run" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-400">
                Lead 에이전트가 Ralph Loop를 실행합니다.
                SHIP/REVISE 결정과 피드백이 실시간으로 표시됩니다.
              </p>
              <button
                onClick={() => setPromptPreview(p => !p)}
                className="px-3 py-1.5 text-xs border border-zinc-800 hover:border-zinc-600 text-zinc-500 rounded-lg transition-colors shrink-0 ml-4"
              >
                {promptPreview ? "프롬프트 숨기기" : "프롬프트 미리보기"}
              </button>
            </div>

            {/* 프롬프트 미리보기 */}
            {promptPreview && (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 max-h-64 overflow-y-auto">
                <p className="text-[10px] text-zinc-600 font-mono mb-2 uppercase tracking-widest">Lead Prompt</p>
                <pre className="text-xs text-zinc-500 whitespace-pre-wrap font-mono leading-relaxed">
                  {`[중요] 어떤 도구도 사용하지 말고...\n주제: ${config.topic || "(미설정)"}\nRalph Loop: ${config.enabled ? "ON" : "OFF"}, 최대 ${config.maxIterations}회, SHIP 기준 ${config.shipThreshold}/5.0\n태스크: ${config.tasks.length}개\n평가 기준:\n${config.reviewCriteria}`}
                </pre>
              </div>
            )}

            {/* 실행 안내 (실행 전) */}
            {!running && !runDone && !streamText && (
              <div className="text-center py-16 text-zinc-600">
                <p className="text-3xl mb-3">🔁</p>
                <p className="text-sm">설계 탭에서 설정 후 "▶ 루프 실행" 버튼을 누르세요</p>
                <p className="text-xs mt-1 text-zinc-700">
                  Ralph Loop: {config.enabled ? "활성화" : "비활성화"} · 최대 {config.maxIterations}회 반복 · SHIP 기준 {config.shipThreshold}/5.0
                </p>
              </div>
            )}

            {/* 터미널 스트림 */}
            {(running || runDone || streamText) && (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
                <TerminalStream
                  active={running || runDone}
                  done={runDone}
                  streamText={streamText}
                  height="h-[50vh]"
                />
              </div>
            )}
          </div>
        )}

        {/* ── 탭: 현황 ── */}
        {tab === "status" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-400">
                Ralph Loop 실행 결과 및 SHIP/REVISE 이벤트 타임라인
              </p>
              <div className="flex items-center gap-1.5 text-xs text-zinc-600">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                3초 폴링 중
              </div>
            </div>

            {/* 빈 상태 */}
            {!hasRun && !bulletin && (
              <div className="text-center py-16 text-zinc-600">
                <p className="text-3xl mb-3">📋</p>
                <p className="text-sm">아직 실행 기록이 없습니다</p>
                <p className="text-xs mt-1">실행 탭에서 루프를 실행하면 여기에 결과가 표시됩니다</p>
              </div>
            )}

            {/* 이벤트 타임라인 */}
            {bulletinEvents.length > 0 && (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-2">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
                  이벤트 타임라인
                </p>
                {bulletinEvents.map((ev, i) => (
                  <div key={i} className={`flex items-start gap-3 text-xs py-1.5 border-b border-zinc-800/50 last:border-0`}>
                    {/* 이벤트 타입 배지 */}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium shrink-0 mt-0.5 ${
                      ev.type === "ship"     ? "bg-green-950 text-green-400 border border-green-900" :
                      ev.type === "revise"   ? "bg-amber-950 text-amber-400 border border-amber-900" :
                      ev.type === "complete" ? "bg-blue-950 text-blue-400 border border-blue-900" :
                      ev.type === "task"     ? "bg-zinc-800 text-zinc-400 border border-zinc-700" :
                                              "bg-purple-950 text-purple-400 border border-purple-900"
                    }`}>
                      {ev.type === "ship"     ? "SHIP ✓" :
                       ev.type === "revise"   ? "REVISE ✗" :
                       ev.type === "complete" ? "완료" :
                       ev.type === "task"     ? "태스크" :
                                               "요약"}
                    </span>
                    <span className="text-zinc-400 leading-snug">{ev.text}</span>
                    {ev.score !== undefined && (
                      <span className="ml-auto text-zinc-600 font-mono shrink-0">{ev.score}/5.0</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 원본 bulletin */}
            {bulletin && (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
                  원본 출력 (team_bulletin.md)
                </p>
                <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto">
                  {bulletin}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
