"use client";

import { useState, useEffect, useCallback } from "react";
import TerminalStream from "@/app/components/TerminalStream";

// ─── 타입 ─────────────────────────────────────────────────────
type TemplateCategory = "action" | "doc";

type TemplateMeta = {
  id: string;
  category: TemplateCategory;
  file: string;
  label: string;
  desc: string;
  exists: boolean;
  tuned: boolean;
};

type TemplateContent = {
  id: string;
  original: string;
  tuned: string;
  hasTuned: boolean;
};

type ViewMode = "original" | "tuned";

// ─── 카테고리 한글 라벨 ────────────────────────────────────────
const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  action: "실행 템플릿",
  doc: "가이드 문서",
};

// ─── 메인 컴포넌트 ─────────────────────────────────────────────
export default function HarnessTemplateTab() {
  const [list, setList] = useState<TemplateMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState<TemplateContent | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("original");
  const [loading, setLoading] = useState(false);

  // ── 튜닝 상태 ──────────────────────────────────────────────
  const [tuning, setTuning] = useState(false);
  const [tuneDone, setTuneDone] = useState(false);
  const [tuneStream, setTuneStream] = useState("");
  const [instruction, setInstruction] = useState("");

  // ── 편집 모드 ──────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  // ── 가이드 일괄 튜닝 ────────────────────────────────────────
  const [batchTuning, setBatchTuning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [batchInstruction, setBatchInstruction] = useState("");

  // ── localStorage 키 ──────────────────────────────────────
  const BATCH_KEY = "harness-batch-tuning";

  // ── 목록 로드 + 일괄 튜닝 자동 재개 ─────────────────────────
  useEffect(() => {
    fetch("/api/setup/harness-templates")
      .then((r) => r.json())
      .then((d) => {
        const loadedList: TemplateMeta[] = d.list ?? [];
        setList(loadedList);

        // 첫 번째 항목 자동 선택
        if (loadedList.length && !selectedId) {
          selectTemplate(loadedList[0].id);
        }

        // 이전에 진행 중이던 일괄 튜닝 자동 재개
        try {
          const saved = JSON.parse(localStorage.getItem(BATCH_KEY) || "null");
          if (saved?.inProgress && saved.pendingIds?.length) {
            const pendingItems = loadedList.filter((t) => saved.pendingIds.includes(t.id));
            if (pendingItems.length) {
              runBatchTuning(pendingItems, saved.instruction ?? "");
            } else {
              localStorage.removeItem(BATCH_KEY);
            }
          }
        } catch { /* localStorage 파싱 실패 무시 */ }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 파일 선택 ──────────────────────────────────────────────
  const selectTemplate = useCallback(async (id: string) => {
    setSelectedId(id);
    setContent(null);
    setEditing(false);
    setTuning(false);
    setTuneDone(false);
    setTuneStream("");
    setLoading(true);

    const res = await fetch(`/api/setup/harness-templates?id=${id}`);
    const data = await res.json();
    setContent(data);
    setViewMode(data.hasTuned ? "tuned" : "original");
    setLoading(false);
  }, []);

  // ── AI 튜닝 실행 ────────────────────────────────────────────
  async function startTuning() {
    if (!selectedId) return;
    setTuning(true);
    setTuneDone(false);
    setTuneStream("");
    setEditing(false);

    let full = "";
    const res = await fetch("/api/setup/harness-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selectedId, instruction }),
    });
    if (!res.ok || !res.body) { setTuning(false); return; }

    const reader = res.body.getReader();
    const dec = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value).split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (!json) continue;
        const event = JSON.parse(json);
        if (event.type === "text") { full += event.text; setTuneStream((p) => p + event.text); }
        if (event.type === "done") {
          setTuneDone(true);
          // 내용 갱신
          setContent((prev) => prev ? { ...prev, tuned: full, hasTuned: true } : null);
          setViewMode("tuned");
          // 목록의 tuned 상태 갱신
          setList((prev) => prev.map((t) => t.id === selectedId ? { ...t, tuned: true } : t));
        }
      }
    }
    setTuning(false);
  }

  // ── 일괄 튜닝 핵심 로직 (초기 시작 + 재개 공용) ──────────────
  async function runBatchTuning(items: TemplateMeta[], instruction: string) {
    if (!items.length) return;
    setBatchTuning(true);

    // 남은 항목 ID를 localStorage에 저장 (페이지 이동 후 재개용)
    const savePending = (pendingIds: string[]) => {
      try {
        if (pendingIds.length === 0) {
          localStorage.removeItem(BATCH_KEY);
        } else {
          localStorage.setItem(BATCH_KEY, JSON.stringify({ inProgress: true, pendingIds, instruction }));
        }
      } catch { /* 무시 */ }
    };

    const total = items.length;
    savePending(items.map((t) => t.id));

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      setBatchProgress({ current: i + 1, total, label: item.label });

      try {
        const res = await fetch("/api/setup/harness-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id, instruction }),
        });
        if (!res.ok || !res.body) continue;

        // SSE 스트림을 끝까지 소비 (완료 신호 대기)
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of dec.decode(value).split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const event = JSON.parse(raw);
              if (event.type === "done") {
                setList((prev) => prev.map((t) => t.id === item.id ? { ...t, tuned: true } : t));
              }
            } catch { /* JSON 파싱 실패 무시 */ }
          }
        }
      } catch { /* 개별 실패 건너뜀 */ }

      // 완료된 항목을 pending에서 제거
      savePending(items.slice(i + 1).map((t) => t.id));
    }

    setBatchTuning(false);
    setBatchProgress(null);
    localStorage.removeItem(BATCH_KEY);
  }

  // ── 일괄 튜닝 시작 (UI 버튼 → 전체 doc 목록으로 실행) ─────────
  function startBatchTuning() {
    const docItems = list.filter((t) => t.category === "doc");
    runBatchTuning(docItems, batchInstruction);
  }

  // ── 편집 저장 ──────────────────────────────────────────────
  async function saveEdit() {
    if (!selectedId || !editContent.trim()) return;
    setSaving(true);
    await fetch("/api/setup/harness-templates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selectedId, content: editContent }),
    });
    setSaving(false);
    setContent((prev) => prev ? { ...prev, tuned: editContent, hasTuned: true } : null);
    setList((prev) => prev.map((t) => t.id === selectedId ? { ...t, tuned: true } : t));
    setEditing(false);
    setSavedMsg("저장되었습니다 ✓");
    setTimeout(() => setSavedMsg(""), 3000);
  }

  // ── 현재 표시할 텍스트 ──────────────────────────────────────
  const displayText = content
    ? viewMode === "tuned" && content.hasTuned
      ? content.tuned
      : content.original
    : "";

  // ── 선택된 템플릿 메타 ──────────────────────────────────────
  const selectedMeta = list.find((t) => t.id === selectedId);
  const isAction = selectedMeta?.category === "action";

  // ─── 렌더링 ────────────────────────────────────────────────
  return (
    <div className="flex gap-4 min-h-[600px]">
      {/* ── 좌측 목록 ─────────────────────────────────────── */}
      <div className="w-52 shrink-0 space-y-4">
        {(["action", "doc"] as TemplateCategory[]).map((cat) => {
          const items = list.filter((t) => t.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat}>
              {/* 가이드 문서 섹션: 일괄 튜닝 버튼 함께 표시 */}
              <div className="flex items-center justify-between mb-1.5 px-1">
                <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">
                  {CATEGORY_LABEL[cat]}
                </p>
                {cat === "doc" && (
                  <button
                    onClick={startBatchTuning}
                    disabled={batchTuning || tuning}
                    className="text-[9px] px-1.5 py-0.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white rounded transition-colors font-medium"
                  >
                    {batchTuning ? "튜닝 중" : "일괄 튜닝"}
                  </button>
                )}
              </div>
              <div className="space-y-0.5">
                {items.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTemplate(t.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center gap-2 ${
                      selectedId === t.id
                        ? "bg-zinc-800 text-zinc-100"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                    }`}
                  >
                    {/* 튜닝 완료 여부 표시 */}
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        t.tuned ? "bg-green-500" : "bg-zinc-700"
                      }`}
                    />
                    <span className="leading-snug">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {/* 일괄 튜닝 진행 상황 */}
        {batchTuning && batchProgress && (
          <div className="mt-2 bg-indigo-950/50 border border-indigo-800/50 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0" />
              <p className="text-[10px] text-indigo-300 font-medium">
                {batchProgress.current}/{batchProgress.total} 튜닝 중
              </p>
            </div>
            <p className="text-[10px] text-indigo-400 truncate">{batchProgress.label}</p>
            {/* 진행 바 */}
            <div className="w-full h-1 bg-indigo-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* 일괄 튜닝용 공통 지시사항 (진행 중이 아닐 때) */}
        {!batchTuning && (
          <div className="mt-2 border-t border-zinc-800 pt-3">
            <p className="text-[9px] text-zinc-600 mb-1.5 uppercase tracking-widest font-semibold">일괄 튜닝 지시사항</p>
            <textarea
              value={batchInstruction}
              onChange={(e) => setBatchInstruction(e.target.value)}
              placeholder="예: Next.js + TypeScript 환경에 맞게. 코드 예시 구체화."
              rows={2}
              className="w-full bg-zinc-900 border border-zinc-800 rounded text-[10px] text-zinc-400 placeholder-zinc-700 p-2 resize-none focus:outline-none focus:border-zinc-700"
            />
          </div>
        )}
      </div>

      {/* ── 우측 뷰어 ─────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-3">
        {!selectedId && (
          <div className="text-center py-20 text-zinc-600">
            <p className="text-sm">좌측에서 템플릿을 선택하세요</p>
          </div>
        )}

        {selectedId && selectedMeta && (
          <>
            {/* 헤더 */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">{selectedMeta.label}</h3>
                {selectedMeta.desc && (
                  <p className="text-xs text-zinc-500 mt-0.5">{selectedMeta.desc}</p>
                )}
              </div>

              {/* 액션 버튼 */}
              <div className="flex items-center gap-2 shrink-0">
                {/* 원본/튜닝 토글 (튜닝 버전 있을 때만) */}
                {content?.hasTuned && !editing && (
                  <div className="flex rounded-lg border border-zinc-800 overflow-hidden text-xs">
                    <button
                      onClick={() => setViewMode("original")}
                      className={`px-3 py-1.5 transition-colors ${
                        viewMode === "original"
                          ? "bg-zinc-800 text-zinc-200"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      원본
                    </button>
                    <button
                      onClick={() => setViewMode("tuned")}
                      className={`px-3 py-1.5 transition-colors ${
                        viewMode === "tuned"
                          ? "bg-zinc-800 text-zinc-200"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      튜닝됨 ✓
                    </button>
                  </div>
                )}

                {/* 편집 / 저장 버튼 */}
                {content?.hasTuned && viewMode === "tuned" && !editing && (
                  <button
                    onClick={() => { setEditContent(content.tuned); setEditing(true); }}
                    className="px-3 py-1.5 text-xs border border-zinc-700 hover:border-zinc-500 text-zinc-300 rounded-lg transition-colors"
                  >
                    편집
                  </button>
                )}
                {editing && (
                  <>
                    <button
                      onClick={() => setEditing(false)}
                      className="px-3 py-1.5 text-xs border border-zinc-700 text-zinc-500 rounded-lg"
                    >
                      취소
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
                    >
                      {saving ? "저장 중..." : "저장"}
                    </button>
                  </>
                )}

                {/* AI 튜닝 버튼 (액션 템플릿 + 가이드 문서 모두) */}
                {!editing && (
                  <button
                    onClick={startTuning}
                    disabled={tuning}
                    className={`px-4 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                      content?.hasTuned
                        ? "border border-zinc-700 hover:border-zinc-500 text-zinc-300"
                        : isAction
                          ? "bg-blue-600 hover:bg-blue-500 text-white"
                          : "bg-indigo-700 hover:bg-indigo-600 text-white"
                    }`}
                  >
                    {tuning ? "튜닝 중..." : content?.hasTuned ? "재튜닝" : isAction ? "이 프로젝트에 맞게 튜닝" : "프로젝트 맞춤 요약"}
                  </button>
                )}
              </div>
            </div>

            {/* 저장 완료 메시지 */}
            {savedMsg && (
              <div className="bg-green-950 border border-green-800 rounded-lg px-3 py-2 text-green-300 text-xs">
                {savedMsg}
              </div>
            )}

            {/* 지시사항 입력 (튜닝 전 전체 표시) */}
            {!editing && !tuning && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 pt-3 pb-3">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                  AI 지시사항{" "}
                  <span className="text-zinc-700 font-normal normal-case tracking-normal">
                    (선택 — 튜닝 시 반영됩니다)
                  </span>
                </p>
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder={isAction
                    ? "예: 스프린트를 2주 단위로 조정해줘. TypeScript 타입 엄격하게. QA 기준을 더 엄격하게."
                    : "예: 이 프로젝트의 Next.js 환경에 맞게 예시를 구체화해줘. 실패 패턴 중 비동기 관련 항목 강조."
                  }
                  rows={2}
                  className="w-full bg-transparent text-xs text-zinc-300 placeholder-zinc-600 resize-none focus:outline-none leading-relaxed"
                />
              </div>
            )}

            {/* 튜닝 중 터미널 출력 */}
            {(tuning || tuneDone) && (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                <TerminalStream
                  active={tuning || tuneDone}
                  done={tuneDone}
                  streamText={tuneStream}
                  height="h-48"
                />
              </div>
            )}

            {/* 편집 모드 */}
            {editing && (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-[50vh] bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-xs text-zinc-200 font-mono leading-relaxed focus:outline-none focus:border-zinc-500 resize-none"
              />
            )}

            {/* 로딩 */}
            {loading && !editing && (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 text-center text-zinc-600 text-sm">
                불러오는 중...
              </div>
            )}

            {/* 콘텐츠 뷰어 */}
            {!loading && !editing && displayText && !(tuning && !tuneDone) && (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 overflow-auto max-h-[60vh]">
                <pre className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed font-mono">
                  {displayText}
                </pre>
              </div>
            )}

            {/* 파일 없음 안내 */}
            {!loading && !displayText && !tuning && (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 text-center text-zinc-600 text-sm">
                <p>템플릿 파일을 찾을 수 없습니다.</p>
                <p className="text-xs mt-1 text-zinc-700">
                  HARNESS_TEMPLATE_PATH 환경변수를 확인하거나 기본 경로를 점검하세요.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
