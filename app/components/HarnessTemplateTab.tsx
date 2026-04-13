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

  // ── 목록 로드 ──────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/setup/harness-templates")
      .then((r) => r.json())
      .then((d) => {
        setList(d.list ?? []);
        // 첫 번째 항목 자동 선택
        if (d.list?.length && !selectedId) {
          selectTemplate(d.list[0].id);
        }
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
              <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1.5 px-1">
                {CATEGORY_LABEL[cat]}
              </p>
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

                {/* AI 튜닝 버튼 (액션 템플릿만) */}
                {isAction && !editing && (
                  <button
                    onClick={startTuning}
                    disabled={tuning}
                    className={`px-4 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                      content?.hasTuned
                        ? "border border-zinc-700 hover:border-zinc-500 text-zinc-300"
                        : "bg-blue-600 hover:bg-blue-500 text-white"
                    }`}
                  >
                    {tuning ? "튜닝 중..." : content?.hasTuned ? "재튜닝" : "이 프로젝트에 맞게 튜닝"}
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

            {/* 지시사항 입력 (액션 템플릿만, 튜닝 전) */}
            {isAction && !editing && !tuning && (
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
                  placeholder="예: 스프린트를 2주 단위로 조정해줘. TypeScript 타입 엄격하게. QA 기준을 더 엄격하게."
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
