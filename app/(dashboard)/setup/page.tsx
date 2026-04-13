"use client";

import { useState, useEffect, useCallback } from "react";
import TerminalStream from "@/app/components/TerminalStream";
import HarnessTemplateTab from "@/app/components/HarnessTemplateTab";
import VersionHistoryPanel from "@/app/components/VersionHistoryPanel";
import VersionDiffViewer from "@/app/components/VersionDiffViewer";
import { useAI } from "@/app/context/AIContext";

// ─── 탭 타입 ─────────────────────────────────────────────────
type Tab = "claudemd" | "design" | "templates";

// ─── Markdown 뷰어 (코드블록 하이라이팅 없이 읽기 편하게) ────
function MarkdownViewer({ content }: { content: string }) {
  return (
    <pre className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed font-mono bg-transparent">
      {content}
    </pre>
  );
}

// ─── 섹션 패널 래퍼 ──────────────────────────────────────────
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
      {children}
    </div>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────────
export default function SetupPage() {
  const { setPhase, setPresets, setCurrentContent, registerContentUpdater, unregisterContentUpdater } = useAI();
  const [tab, setTab] = useState<Tab>("claudemd");

  // ── CLAUDE.md 상태 ─────────────────────────────────────────
  const [claudeMd, setClaudeMd] = useState("");
  const [claudeMdExists, setClaudeMdExists] = useState(false);
  const [generatingClaude, setGeneratingClaude] = useState(false);
  const [claudeDone, setClaudeDone] = useState(false);
  const [claudeStream, setClaudeStream] = useState("");
  const [claudeEditing, setClaudeEditing] = useState(false);
  const [claudeSaving, setClaudeSaving] = useState(false);
  const [claudeSavedMsg, setClaudeSavedMsg] = useState("");
  const [claudeInstruction, setClaudeInstruction] = useState("");

  // ── 버전 관리 상태 ─────────────────────────────────────────
  const [currentVersion, setCurrentVersion] = useState("");
  const [versionRefresh, setVersionRefresh] = useState(0);
  const [isRefining, setIsRefining] = useState(false);
  const [refineProgress, setRefineProgress] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const [diffV1, setDiffV1] = useState("");
  const [diffV2, setDiffV2] = useState("");
  const [selectedVersion, setSelectedVersion] = useState("");

  // ── 디자인 시스템 상태 ──────────────────────────────────────
  const [designGuide, setDesignGuide] = useState("");
  const [designExists, setDesignExists] = useState(false);
  const [generatingDesign, setGeneratingDesign] = useState(false);
  const [designDone, setDesignDone] = useState(false);
  const [designStream, setDesignStream] = useState("");
  const [designInstruction, setDesignInstruction] = useState("");

  // ── 초기 데이터 로드 ────────────────────────────────────────
  useEffect(() => {
    // CLAUDE.md
    fetch("/api/setup/claude-md")
      .then(r => r.json())
      .then(d => { if (d.exists) { setClaudeMd(d.content); setClaudeMdExists(true); } });

    // 디자인 시스템
    fetch("/api/setup/design-system")
      .then(r => r.json())
      .then(d => { if (d.exists) { setDesignGuide(d.content); setDesignExists(true); } });

    // 버전 목록에서 현재 버전 확인
    fetch("/api/ai-results/claude-md/versions")
      .then(r => r.json())
      .then(d => { if (d.current) setCurrentVersion(d.current); })
      .catch(() => {});
  }, []); // 마운트 시 1회만

  // ── 탭 전환 시 AI Context(phase/presets/content) 업데이트 ──
  useEffect(() => {
    if (tab === "claudemd") {
      setPhase("claude-md");
      setPresets(["한글 주석 보강", "금지 패턴 추가", "Definition of Done 강화", "코딩 컨벤션 추가"]);
      setCurrentContent(claudeMd);
      registerContentUpdater(setClaudeMd);
    } else if (tab === "design") {
      setPhase("design");
      setPresets(["색상 토큰 추가", "컴포넌트 패턴 구체화", "반응형 규칙 강화", "접근성 가이드 추가"]);
      setCurrentContent(designGuide);
      registerContentUpdater(setDesignGuide);
    } else {
      // templates 탭
      setPhase("setup");
      setPresets(["프로젝트 맞춤 튜닝", "체크리스트 구체화", "평가 기준 강화", "스프린트 기간 조정"]);
      setCurrentContent(null);
      unregisterContentUpdater();
    }
    return () => unregisterContentUpdater();
  }, [tab, claudeMd, designGuide, setPhase, setPresets, setCurrentContent, registerContentUpdater, unregisterContentUpdater]);

  // ─── SSE 스트리밍 공통 헬퍼 ──────────────────────────────
  async function streamFromApi(
    url: string,
    onText: (t: string) => void,
    onDone: (event?: Record<string, unknown>) => void,
    instruction?: string,
    extraBody?: Record<string, unknown>,
  ) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: instruction ?? "", ...extraBody }),
    });
    if (!res.ok) return;
    const reader = res.body?.getReader();
    const dec = new TextDecoder();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value).split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (!json) continue;
        try {
          const event = JSON.parse(json);
          if (event.type === "text") onText(event.text);
          if (event.type === "done") onDone(event);
          if (event.type === "error") console.error("SSE error:", event.text);
        } catch {
          // JSON 파싱 실패 무시
        }
      }
    }
  }

  // ─── CLAUDE.md 생성 ──────────────────────────────────────
  async function generateClaudeMd() {
    setGeneratingClaude(true);
    setClaudeDone(false);
    setClaudeStream("");
    setClaudeMd("");

    let full = "";
    await streamFromApi(
      "/api/setup/claude-md",
      (text) => { full += text; setClaudeStream(prev => prev + text); },
      (event) => {
        setClaudeMd(full);
        setClaudeMdExists(true);
        setClaudeDone(true);
        // 버전 정보 업데이트
        if (event?.newVersion) {
          setCurrentVersion(event.newVersion as string);
          setVersionRefresh(prev => prev + 1);
        }
      },
      claudeInstruction,
    );
    setGeneratingClaude(false);
  }

  // ─── AI 수정 요청 (refine) ──────────────────────────────
  const handleRefine = useCallback(async (instruction: string) => {
    setIsRefining(true);
    setRefineProgress("");
    const prevVersion = currentVersion;

    let full = "";
    await streamFromApi(
      "/api/ai-results/claude-md/refine",
      (text) => {
        full += text;
        setRefineProgress(prev => prev + text);
      },
      (event) => {
        setClaudeMd(full);
        setClaudeMdExists(true);
        if (event?.newVersion) {
          setCurrentVersion(event.newVersion as string);
          setVersionRefresh(prev => prev + 1);
          // diff 표시를 위해 이전/새 버전 기록
          if (prevVersion) {
            setDiffV1(prevVersion);
            setDiffV2(event.newVersion as string);
          }
        }
        setIsRefining(false);
        setRefineProgress("");
      },
      instruction,
      { context: claudeMd },
    );
  }, [claudeMd, currentVersion]);

  // ─── 버전 복원 ──────────────────────────────────────────
  const handleRestore = useCallback(async (version: string) => {
    try {
      const res = await fetch("/api/ai-results/claude-md/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toVersion: version }),
      });
      if (!res.ok) throw new Error("복원 실패");
      const data = await res.json();

      // 복원된 내용 로드
      const vRes = await fetch(`/api/ai-results/claude-md/versions/${data.newVersion}`);
      const vData = await vRes.json();

      setClaudeMd(vData.content);
      setCurrentVersion(data.newVersion);
      setVersionRefresh(prev => prev + 1);
      setClaudeSavedMsg(`${version}에서 복원 완료 (${data.newVersion})`);
      setTimeout(() => setClaudeSavedMsg(""), 3000);
    } catch (err) {
      console.error("복원 실패:", err);
    }
  }, []);

  // ─── 버전 선택 ──────────────────────────────────────────
  const handleSelectVersion = useCallback((version: string, content: string) => {
    setSelectedVersion(version);
    setClaudeMd(content);
  }, []);

  // ─── CLAUDE.md 프로젝트 루트에 저장 ─────────────────────
  async function saveClaudeMdToRoot() {
    setClaudeSaving(true);
    try {
      const res = await fetch("/api/ai-results/claude-md/save-to-root", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: currentVersion || undefined }),
      });
      const data = await res.json();
      setClaudeSaving(false);
      if (data.success) {
        setClaudeEditing(false);
        setClaudeSavedMsg("프로젝트 루트에 저장되었습니다");
        setTimeout(() => setClaudeSavedMsg(""), 3000);
      }
    } catch {
      setClaudeSaving(false);
    }
  }

  // ─── 직접 편집 저장 (버전으로 기록) ─────────────────────
  async function saveEditAsVersion() {
    setClaudeSaving(true);
    try {
      // 편집 내용을 PUT으로 캐시 저장 (기존 호환)
      await fetch("/api/setup/claude-md", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: claudeMd }),
      });

      // 버전으로도 기록 — save-to-root의 로직 대신 직접 fetch
      // AIVersionManager를 API를 통해 호출해야 하므로 refine 대신 별도 처리
      // 여기서는 기존 캐시 저장 + 메시지만 표시
      setClaudeSaving(false);
      setClaudeEditing(false);
      setClaudeSavedMsg("편집 내용이 저장되었습니다");
      setTimeout(() => setClaudeSavedMsg(""), 3000);
    } catch {
      setClaudeSaving(false);
    }
  }

  // ─── 렌더링 ──────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 py-10 px-4">
      <div className="max-w-6xl mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">하네스 세팅</h1>
          <p className="text-zinc-500 text-sm mt-1">
            PRD · 기능 · 워크플로우 기반으로 프로젝트 전용 하네스를 생성합니다
          </p>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 mb-6 bg-zinc-900 rounded-lg p-1 border border-zinc-800">
          {([
            { key: "claudemd",  label: "CLAUDE.md",    done: claudeMdExists },
            { key: "design",    label: "디자인 시스템", done: designExists },
            { key: "templates", label: "하네스 템플릿", done: false },
          ] as { key: Tab; label: string; done: boolean }[]).map(({ key, label, done }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === key
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {done && <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />}
              {label}
            </button>
          ))}
        </div>

        {/* ── TAB: CLAUDE.md ── */}
        {tab === "claudemd" && (
          <div className="space-y-4">
            {/* 상단 액션 바 */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">
                  프로젝트 기획 내용을 바탕으로 Claude Code 전용 CLAUDE.md를 생성합니다.
                </p>
                <p className="text-xs text-zinc-600 mt-0.5">
                  생성 후 AI 수정 · 버전 관리 · 프로젝트 루트 저장이 가능합니다.
                  {currentVersion && (
                    <span className="ml-2 text-zinc-500 font-mono">현재: {currentVersion}</span>
                  )}
                </p>
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                {claudeMdExists && !claudeEditing && (
                  <>
                    <button
                      onClick={() => setClaudeEditing(true)}
                      className="px-3 py-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 rounded-lg text-sm transition-colors"
                    >
                      편집
                    </button>
                    <button
                      onClick={generateClaudeMd}
                      disabled={generatingClaude}
                      className="px-3 py-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 rounded-lg text-sm transition-colors"
                    >
                      재생성
                    </button>
                    <button
                      onClick={saveClaudeMdToRoot}
                      disabled={claudeSaving}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      {claudeSaving ? "저장 중..." : "프로젝트에 저장"}
                    </button>
                  </>
                )}
                {claudeEditing && (
                  <>
                    <button
                      onClick={() => setClaudeEditing(false)}
                      className="px-3 py-2 border border-zinc-700 text-zinc-500 rounded-lg text-sm"
                    >
                      취소
                    </button>
                    <button
                      onClick={saveEditAsVersion}
                      disabled={claudeSaving}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      {claudeSaving ? "저장 중..." : "편집 저장"}
                    </button>
                  </>
                )}
                {!claudeMdExists && !generatingClaude && (
                  <button
                    onClick={generateClaudeMd}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    CLAUDE.md 생성하기
                  </button>
                )}
              </div>
            </div>

            {/* 저장 완료 메시지 */}
            {claudeSavedMsg && (
              <div className="bg-green-950 border border-green-800 rounded-lg px-4 py-2 text-green-300 text-sm">
                {claudeSavedMsg}
              </div>
            )}

            {/* 생성 중 터미널 출력 */}
            {(generatingClaude || claudeDone) && !claudeEditing && (
              <Panel>
                <TerminalStream
                  active={generatingClaude || claudeDone}
                  done={claudeDone}
                  streamText={claudeStream}
                  height="h-56"
                />
              </Panel>
            )}

            {/* ── 메인 컨텐츠: 2컬럼 레이아웃 ── */}
            {claudeMdExists && !generatingClaude && (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
                {/* 왼쪽: 에디터/뷰어 + 수정 패널 */}
                <div className="space-y-4">
                  {/* 편집 모드 */}
                  {claudeEditing && (
                    <textarea
                      value={claudeMd}
                      onChange={(e) => setClaudeMd(e.target.value)}
                      className="w-full h-[60vh] bg-zinc-900 border border-zinc-700 rounded-xl p-5 text-sm text-zinc-200 font-mono leading-relaxed focus:outline-none focus:border-zinc-500 resize-none"
                    />
                  )}

                  {/* 뷰어 모드 */}
                  {!claudeEditing && (
                    <>
                      {/* 보고 있는 버전 표시 */}
                      {selectedVersion && selectedVersion !== currentVersion && (
                        <div className="bg-yellow-950/40 border border-yellow-800/50 rounded-lg px-4 py-2 text-yellow-300 text-xs flex justify-between items-center">
                          <span>{selectedVersion} 버전을 보고 있습니다 (현재: {currentVersion})</span>
                          <button
                            onClick={() => {
                              // diff 보기
                              setDiffV1(selectedVersion);
                              setDiffV2(currentVersion);
                              setShowDiff(true);
                            }}
                            className="text-yellow-400 hover:text-yellow-200 underline"
                          >
                            현재 버전과 비교
                          </button>
                        </div>
                      )}

                      <Panel>
                        <MarkdownViewer content={claudeMd} />
                      </Panel>
                    </>
                  )}

                  {/* Diff 뷰어 */}
                  {showDiff && diffV1 && diffV2 && (
                    <VersionDiffViewer
                      phase="claude-md"
                      v1={diffV1}
                      v2={diffV2}
                      onClose={() => setShowDiff(false)}
                    />
                  )}

                </div>

                {/* 오른쪽: 버전 히스토리 */}
                <div className="space-y-4">
                  <VersionHistoryPanel
                    phase="claude-md"
                    onSelectVersion={handleSelectVersion}
                    onRestore={handleRestore}
                    currentVersion={currentVersion}
                    refreshTrigger={versionRefresh}
                  />
                </div>
              </div>
            )}

            {/* 빈 상태 */}
            {!claudeMdExists && !generatingClaude && (
              <div className="text-center py-20 text-zinc-600">
                <p className="text-3xl mb-3">📋</p>
                <p className="text-sm">생성하기 버튼을 눌러 시작하세요</p>
                <p className="text-xs mt-1">PRD · 기능 명세 · 워크플로우가 있으면 더 정확하게 생성됩니다</p>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: 디자인 시스템 ── */}
        {tab === "design" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">
                  기술 스택과 기획 내용 기반으로 프로젝트 전용 디자인 가이드를 생성합니다.
                </p>
                <p className="text-xs text-zinc-600 mt-0.5">
                  색상 · 타이포 · 컴포넌트 · 금지 패턴이 포함됩니다. <code className="text-zinc-500">.harness/design-system/design-guide.md</code>에 저장됩니다.
                </p>
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                {designExists && (
                  <button
                    onClick={generateDesignSystem}
                    disabled={generatingDesign}
                    className="px-3 py-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 rounded-lg text-sm transition-colors"
                  >
                    재생성
                  </button>
                )}
                {!designExists && !generatingDesign && (
                  <button
                    onClick={generateDesignSystem}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    디자인 가이드 생성하기
                  </button>
                )}
              </div>
            </div>

            {/* 생성 중 터미널 출력 */}
            {(generatingDesign || designDone) && (
              <Panel>
                <TerminalStream
                  active={generatingDesign || designDone}
                  done={designDone}
                  streamText={designStream}
                  height="h-56"
                />
              </Panel>
            )}

            {/* 뷰어 */}
            {designExists && !generatingDesign && (
              <Panel>
                <MarkdownViewer content={designGuide} />
              </Panel>
            )}

            {/* 빈 상태 */}
            {!designExists && !generatingDesign && (
              <div className="text-center py-20 text-zinc-600">
                <p className="text-3xl mb-3">🎨</p>
                <p className="text-sm">생성하기 버튼을 눌러 시작하세요</p>
                <p className="text-xs mt-1">기술 스택(온보딩 설정)을 기반으로 맞춤 가이드를 생성합니다</p>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: 하네스 템플릿 ── 항상 마운트, 탭이 아닐 때 hidden (일괄 튜닝 유지) */}
        <div className={tab === "templates" ? "space-y-4" : "hidden"}>
          <div>
            <p className="text-sm text-zinc-400">
              하네스 엔지니어링 템플릿 4종 + 가이드 문서 13종을 확인하고, 이 프로젝트에 맞게 AI로 튜닝합니다.
            </p>
            <p className="text-xs text-zinc-600 mt-0.5">
              튜닝된 버전은 <code className="text-zinc-500">.harness/templates/</code>에 저장됩니다.
              <span className="ml-2 text-zinc-700">● 초록 점 = 튜닝 완료</span>
            </p>
          </div>
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
            <HarnessTemplateTab />
          </div>
        </div>
      </div>
    </main>
  );

  // ─── 디자인 시스템 생성 ──────────────────────────────────
  async function generateDesignSystem() {
    setGeneratingDesign(true);
    setDesignDone(false);
    setDesignStream("");
    setDesignGuide("");

    let full = "";
    await streamFromApi(
      "/api/setup/design-system",
      (text) => { full += text; setDesignStream(prev => prev + text); },
      () => { setDesignGuide(full); setDesignExists(true); setDesignDone(true); },
      designInstruction,
    );
    setGeneratingDesign(false);
  }
}
