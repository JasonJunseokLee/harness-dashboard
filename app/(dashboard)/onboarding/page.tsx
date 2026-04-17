"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import TerminalStream from "@/app/components/TerminalStream";

// ─── 타입 정의 ────────────────────────────────────────────────
type Question = {
  id: string;
  question: string;
  type: "single" | "multiple";
  options: string[];
};

type ContextFile = {
  name: string;
  size: number;
  sizeLabel: string;
};

type AnalysisData = {
  summary: string;
  userPainPoints: string[];
  marketInsights: string[];
  keyData: string[];
  requirements: string[];
  opportunities: string[];
};

type TechStack = {
  frontend: string[];
  backend: string[];
  styling: string[];
  database: string[];
  testing: string[];
  deployment: string[];
  other: string;
};

// Step 순서: "mode"=시작모드선택, 1=컨텍스트, analysis=분석, 2=프로젝트설명, techstack=기술스택, 3=질문생성, 4=답변
// 기존 프로젝트 모드: "mode" → "scan" → "scan-review"
type Step = "mode" | "scan" | "scan-review" | 1 | "analysis" | 2 | "techstack" | 3 | 4;
type OnboardingMode = "new" | "existing";

// 코드베이스 스캔 결과 타입
type ScanResult = {
  projectName: string;
  description: string;
  techStack: TechStack;
  completionEstimate: number;
  prd: Record<string, unknown>;
  features: Array<{ id: string; category: string; label: string; description: string; status: string; evidence: string }>;
  devlogEntries: string[];
  nextSuggestions: string[];
};

// ─── 기술 스택 선택 옵션 ──────────────────────────────────────
const TECH_OPTIONS: Record<keyof Omit<TechStack, "other">, string[]> = {
  frontend:   ["Next.js", "React", "Vue", "Nuxt", "Svelte", "Vanilla JS"],
  backend:    ["Next.js API Routes", "Express", "Fastify", "NestJS", "FastAPI", "Django", "Spring Boot"],
  styling:    ["Tailwind CSS", "CSS Modules", "Styled Components", "shadcn/ui", "Chakra UI", "MUI"],
  database:   ["PostgreSQL", "MySQL", "MongoDB", "SQLite", "Supabase", "Firebase", "Prisma (ORM)"],
  testing:    ["Jest", "Vitest", "Playwright", "Cypress", "React Testing Library"],
  deployment: ["Vercel", "AWS", "GCP", "Docker", "Railway", "Netlify"],
};

const TECH_LABELS: Record<keyof Omit<TechStack, "other">, string> = {
  frontend:   "프론트엔드",
  backend:    "백엔드",
  styling:    "스타일링",
  database:   "데이터베이스",
  testing:    "테스팅",
  deployment: "배포",
};

// ─── 메인 컴포넌트 ────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<OnboardingMode>("new");

  // 기존 프로젝트 스캔 상태
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [scanStream, setScanStream] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState("");

  // Step 1: context 파일
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step "analysis": 컨텍스트 분석
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);
  const [analysisStream, setAnalysisStream] = useState("");
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [analysisError, setAnalysisError] = useState("");

  // Step 2: 프로젝트 설명
  const [description, setDescription] = useState("");

  // Step "techstack": 기술 스택
  const [techStack, setTechStack] = useState<TechStack>({
    frontend: [], backend: [], styling: [], database: [],
    testing: [], deployment: [], other: "",
  });

  // Step 3: 동적 질문
  const [questions, setQuestions] = useState<Question[]>([]);
  const [generatingQ, setGeneratingQ] = useState(false);
  const [qDone, setQDone] = useState(false);
  const [rawBuffer, setRawBuffer] = useState("");

  // Step 4: 답변
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // ─── 코드베이스 스캔 ──────────────────────────────────────────
  async function runCodebaseScan() {
    setScanning(true);
    setScanDone(false);
    setScanStream("");
    setScanResult(null);
    setScanError("");
    setStep("scan");

    const res = await fetch("/api/codebase-scan", { method: "POST" });
    if (!res.ok || !res.body) { setScanError("스캔 실패"); setScanning(false); return; }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.type === "text") setScanStream(p => p + ev.text);
          if (ev.type === "done") {
            setScanDone(true);
            setScanning(false);
            if (ev.result) setScanResult(ev.result);
            else if (ev.error) setScanError(ev.error);
            setStep("scan-review");
          }
        } catch { /* 무시 */ }
      }
    }
  }

  // context 파일 목록 로드
  useEffect(() => {
    fetch("/api/context")
      .then((r) => r.json())
      .then((d) => setContextFiles(d.files ?? []));
  }, []);

  // ─── Step 1: 파일 업로드 ──────────────────────────────────
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/context", { method: "POST", body: fd });
    if (res.ok) {
      const updated = await fetch("/api/context").then((r) => r.json());
      setContextFiles(updated.files ?? []);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Step 1 → 다음: 파일이 있으면 분석, 없으면 Step 2
  function handleStep1Next() {
    if (contextFiles.length > 0) {
      setStep("analysis");
      runAnalysis();
    } else {
      setStep(2);
    }
  }

  // ─── Step "analysis": 컨텍스트 분석 ──────────────────────
  async function runAnalysis() {
    setAnalyzing(true);
    setAnalysisDone(false);
    setAnalysisStream("");
    setAnalysisData(null);
    setAnalysisError("");

    const res = await fetch("/api/context-analysis", { method: "POST" });
    if (!res.ok) {
      setAnalysisError("분석 중 오류가 발생했습니다.");
      setAnalyzing(false);
      return;
    }

    const reader = res.body?.getReader();
    const dec = new TextDecoder();

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value).split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (!json) continue;
        const event = JSON.parse(json);
        if (event.type === "text") setAnalysisStream((p) => p + event.text);
        if (event.type === "done") {
          if (event.analysis) {
            setAnalysisData(event.analysis);
            setAnalysisDone(true);
          } else {
            setAnalysisError(event.error ?? "파싱 실패");
          }
        }
      }
    }
    setAnalyzing(false);
  }

  // ─── Step "techstack": 기술 스택 토글 ────────────────────
  function toggleTechStack(category: keyof Omit<TechStack, "other">, option: string) {
    setTechStack((prev) => {
      const current = prev[category];
      return {
        ...prev,
        [category]: current.includes(option)
          ? current.filter((o) => o !== option)
          : [...current, option],
      };
    });
  }

  // ─── Step 3: 질문 생성 ────────────────────────────────────
  async function generateQuestions() {
    setGeneratingQ(true);
    setQDone(false);
    setQuestions([]);
    setRawBuffer("");

    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate_questions", description }),
    });

    const reader = res.body?.getReader();
    const dec = new TextDecoder();
    let accumulated = "";

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value).split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (!json) continue;
        const event = JSON.parse(json);
        if (event.type === "text") {
          accumulated += event.text;
          setRawBuffer(accumulated);
        }
        if (event.type === "done") {
          try {
            const cleaned = accumulated.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
            const parsed = JSON.parse(cleaned);
            setQuestions(parsed.questions ?? []);
            setQDone(true);
          } catch {
            console.error("질문 파싱 실패:", accumulated);
          }
        }
      }
    }
    setGeneratingQ(false);
  }

  // ─── Step 4: 답변 저장 ────────────────────────────────────
  async function saveAnswers() {
    setSaving(true);
    const mergedAnswers = { ...answers };
    Object.entries(customInputs).forEach(([qId, text]) => {
      if (!text.trim()) return;
      const q = questions.find((q) => q.id === qId);
      if (!q) return;
      if (q.type === "multiple") {
        mergedAnswers[qId] = [...((mergedAnswers[qId] as string[]) ?? []), text.trim()];
      } else {
        mergedAnswers[qId] = text.trim();
      }
    });

    await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_answers",
        description,
        questions,
        answers: mergedAnswers,
        techStack, // 기술 스택 포함
      }),
    });
    setSaving(false);
    router.push("/prd");
  }

  // 단일/복수 선택 토글
  function toggleAnswer(qId: string, option: string, type: "single" | "multiple") {
    setAnswers((prev) => {
      if (type === "single") return { ...prev, [qId]: option };
      const current = (prev[qId] as string[]) ?? [];
      return {
        ...prev,
        [qId]: current.includes(option)
          ? current.filter((o) => o !== option)
          : [...current, option],
      };
    });
  }

  const allAnswered = questions.every((q) => {
    const a = answers[q.id];
    const custom = customInputs[q.id];
    if (custom?.trim()) return true;
    return q.type === "single" ? !!a : Array.isArray(a) && a.length > 0;
  });

  // ─── 시각 단계 계산 ───────────────────────────────────────
  const visualStep =
    step === "mode" ? 0
    : step === "scan" || step === "scan-review" ? 1
    : step === 1 ? 1
    : step === "analysis" ? 1
    : step === 2 ? 2
    : step === "techstack" ? 3
    : step === 3 ? 4
    : 5; // step 4

  // ─── 렌더링 ───────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-start py-12 px-4">
      <div className="w-full max-w-2xl">

        {/* ── STEP "mode": 시작 방법 선택 ── */}
        {step === "mode" && (
          <div className="space-y-8">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">어떻게 시작할까요?</h1>
              <p className="text-zinc-500 text-sm mt-1">프로젝트 상황에 맞게 선택하세요</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {/* 새 프로젝트 */}
              <button
                onClick={() => { setMode("new"); setStep(1); }}
                className="group text-left p-6 rounded-2xl border-2 border-zinc-800 hover:border-blue-600 bg-zinc-900 hover:bg-blue-950/20 transition-all"
              >
                <div className="text-3xl mb-3">🌱</div>
                <div className="font-semibold text-zinc-100 mb-1">새 프로젝트</div>
                <div className="text-xs text-zinc-500 leading-relaxed">
                  아직 코드가 없는 프로젝트.<br />
                  질문에 답하면 PRD·기능명세·스프린트 플랜을 처음부터 만들어 드립니다.
                </div>
              </button>

              {/* 기존 프로젝트 */}
              <button
                onClick={() => { setMode("existing"); runCodebaseScan(); }}
                className="group text-left p-6 rounded-2xl border-2 border-zinc-800 hover:border-purple-600 bg-zinc-900 hover:bg-purple-950/20 transition-all"
              >
                <div className="text-3xl mb-3">🔍</div>
                <div className="font-semibold text-zinc-100 mb-1">기존 프로젝트 분석</div>
                <div className="text-xs text-zinc-500 leading-relaxed">
                  이미 개발 중인 프로젝트.<br />
                  코드베이스를 분석해 현재 상태를 자동으로 파악하고, 이어서 작업할 수 있게 준비합니다.
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ── STEP "scan": 코드베이스 분석 중 ── */}
        {(step === "scan" || (step === "scan-review" && scanning)) && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">코드베이스 분석 중...</h2>
              <p className="text-zinc-500 text-sm mt-1">
                파일 구조, git 히스토리, 기술 스택을 읽고 있습니다
              </p>
            </div>
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
              <TerminalStream active={scanning} done={scanDone} streamText={scanStream} />
            </div>
          </div>
        )}

        {/* ── STEP "scan-review": 분석 결과 검토 ── */}
        {step === "scan-review" && !scanning && (
          <div className="space-y-6">
            {scanError ? (
              <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
                분석 실패: {scanError}
                <button className="ml-4 underline" onClick={runCodebaseScan}>다시 시도</button>
              </div>
            ) : scanResult && (
              <>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-lg font-semibold">분석 완료</h2>
                    <span className="text-xs bg-purple-950 text-purple-300 border border-purple-800 rounded-full px-2.5 py-0.5">
                      {scanResult.completionEstimate}% 완성 추정
                    </span>
                  </div>
                  <p className="text-zinc-500 text-sm">아래 내용을 확인하고 틀린 부분이 있으면 수정 후 확정하세요.</p>
                </div>

                {/* 프로젝트 설명 */}
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-2">
                  <div className="text-xs text-zinc-500 uppercase tracking-wider">프로젝트</div>
                  <div className="font-semibold text-zinc-100">{scanResult.projectName}</div>
                  <div className="text-sm text-zinc-400">{scanResult.description}</div>
                </div>

                {/* 기술 스택 */}
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-2">
                  <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">감지된 기술 스택</div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      ...(scanResult.techStack.frontend ?? []),
                      ...(scanResult.techStack.backend ?? []),
                      ...(scanResult.techStack.styling ?? []),
                      ...(scanResult.techStack.database ?? []),
                    ].map(t => (
                      <span key={t} className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-xs">{t}</span>
                    ))}
                  </div>
                </div>

                {/* 기능 목록 (상태 포함) */}
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-2">
                  <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
                    감지된 기능 ({scanResult.features.length}개)
                  </div>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {scanResult.features.map((f) => (
                      <div key={f.id} className="flex items-start gap-2.5 text-sm">
                        <span className={`mt-0.5 shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          f.status === 'done' ? 'bg-green-950 text-green-300'
                          : f.status === 'in-progress' ? 'bg-blue-950 text-blue-300'
                          : 'bg-zinc-800 text-zinc-500'
                        }`}>
                          {f.status === 'done' ? '완료' : f.status === 'in-progress' ? '진행' : '예정'}
                        </span>
                        <div>
                          <span className="text-zinc-200">{f.label}</span>
                          {f.evidence && <span className="text-zinc-600 text-xs ml-1.5">({f.evidence})</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 다음 제안 */}
                {scanResult.nextSuggestions?.length > 0 && (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                    <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">다음으로 추천</div>
                    <ul className="space-y-1">
                      {scanResult.nextSuggestions.map((s, i) => (
                        <li key={i} className="text-sm text-zinc-400 flex gap-2">
                          <span className="text-zinc-600">→</span>{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 확정 버튼 */}
                <div className="flex justify-between items-center pt-2">
                  <button
                    className="text-sm text-zinc-500 hover:text-zinc-300"
                    onClick={runCodebaseScan}
                  >
                    다시 분석
                  </button>
                  <button
                    className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
                    onClick={() => router.push("/prd")}
                  >
                    이대로 시작하기 →
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 헤더 (새 프로젝트 플로우) */}
        {(step !== "mode" && step !== "scan" && step !== "scan-review") && (
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-zinc-100">프로젝트 온보딩</h1>
          <p className="text-zinc-500 text-sm mt-1">기획 시작 전 프로젝트 맥락을 설정합니다</p>
          {/* 진행 단계 표시 (5단계) */}
          <div className="flex items-center gap-2 mt-6">
            {[
              { n: 1, label: "컨텍스트" },
              { n: 2, label: "프로젝트 설명" },
              { n: 3, label: "기술 스택" },
              { n: 4, label: "질문 생성" },
              { n: 5, label: "답변" },
            ].map(({ n, label }) => (
              <div key={n} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  visualStep === n ? "bg-blue-600 text-white"
                    : visualStep > n ? "bg-green-600 text-white"
                    : "bg-zinc-800 text-zinc-500"
                }`}>
                  {visualStep > n ? "✓" : n}
                </div>
                <span className={`text-xs ${visualStep === n ? "text-zinc-100" : "text-zinc-600"}`}>
                  {label}
                </span>
                {n < 5 && <div className="w-6 h-px bg-zinc-800" />}
              </div>
            ))}
          </div>
        </div>
        )}

        {/* ── STEP 1: 컨텍스트 파일 ── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">참고 자료 업로드</h2>
              <p className="text-zinc-400 text-sm">
                AI가 기획 시 참고할 파일을 넣어주세요 (녹취록, 시장조사 등).
                없으면 건너뛰어도 됩니다.
              </p>
            </div>

            {contextFiles.length > 0 ? (
              <div className="bg-zinc-900 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
                {contextFiles.map((f) => (
                  <div key={f.name} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-zinc-200">{f.name}</span>
                    <span className="text-xs text-zinc-500">{f.sizeLabel}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-zinc-900 rounded-lg border border-dashed border-zinc-700 p-8 text-center">
                <p className="text-zinc-500 text-sm">아직 파일이 없습니다</p>
                <p className="text-zinc-600 text-xs mt-1">
                  프로젝트 폴더의 <code className="text-zinc-400">context/</code> 에 직접 넣거나 아래 버튼으로 업로드하세요
                </p>
              </div>
            )}

            <div>
              <input ref={fileInputRef} type="file" accept=".txt,.md,.pdf,.json,.csv"
                onChange={handleFileUpload} className="hidden" id="file-upload" />
              <label htmlFor="file-upload"
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 text-sm cursor-pointer transition-colors ${
                  uploading ? "text-zinc-500 cursor-not-allowed" : "hover:border-zinc-500 hover:bg-zinc-900 text-zinc-300"
                }`}>
                {uploading ? "업로드 중..." : "+ 파일 추가"}
              </label>
            </div>

            <button onClick={handleStep1Next}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">
              {contextFiles.length > 0 ? "자료 분석하기 →" : "건너뛰기 →"}
            </button>
          </div>
        )}

        {/* ── STEP "analysis": 컨텍스트 분석 ── */}
        {step === "analysis" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">자료 분석</h2>
              <p className="text-zinc-400 text-sm">
                업로드된 {contextFiles.length}개 파일을 AI가 분석하고 있습니다.
              </p>
            </div>

            {/* 진행률 바 */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
              <TerminalStream
                active={analyzing || analysisDone}
                done={analysisDone}
                streamText={analysisStream}
              />
            </div>

            {/* 분석 오류 */}
            {analysisError && (
              <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
                {analysisError}
                <button onClick={runAnalysis}
                  className="ml-3 px-3 py-1 bg-red-900 hover:bg-red-800 rounded-lg text-xs">
                  재시도
                </button>
              </div>
            )}

            {/* 분석 결과 리포트 */}
            {analysisData && (
              <div className="space-y-3">
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">요약</p>
                  <p className="text-sm text-zinc-300 leading-relaxed">{analysisData.summary}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <AnalysisCard title="사용자 문제" items={analysisData.userPainPoints} color="text-red-400" />
                  <AnalysisCard title="시장 인사이트" items={analysisData.marketInsights} color="text-blue-400" />
                  <AnalysisCard title="핵심 데이터" items={analysisData.keyData} color="text-yellow-400" />
                  <AnalysisCard title="요구사항" items={analysisData.requirements} color="text-green-400" />
                </div>
                {analysisData.opportunities.length > 0 && (
                  <AnalysisCard title="기회 요인" items={analysisData.opportunities} color="text-purple-400" />
                )}
              </div>
            )}

            {/* 하단 버튼 */}
            {!analyzing && (
              <div className="flex gap-3">
                <button onClick={() => setStep(1)}
                  className="px-4 py-3 border border-zinc-700 text-zinc-400 rounded-lg text-sm hover:border-zinc-600 transition-colors">
                  ← 이전
                </button>
                {(analysisData || analysisError) && (
                  <button onClick={() => setStep(2)}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">
                    {analysisData ? "분석 확인, 계속 →" : "건너뛰고 계속 →"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: 프로젝트 설명 ── */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">프로젝트 설명</h2>
              <p className="text-zinc-400 text-sm">
                만들려는 것을 간략히 설명해주세요. 이를 바탕으로 맞춤 질문을 생성합니다.
              </p>
            </div>

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="예: 축산물 도매 유통업체를 위한 재고/출하 관리 ERP 시스템"
              className="w-full h-36 bg-zinc-900 border border-zinc-700 rounded-lg p-4 text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none focus:border-zinc-500 text-sm"
            />

            <div className="flex gap-3">
              <button
                onClick={() => setStep(contextFiles.length > 0 ? "analysis" : 1)}
                className="px-4 py-3 border border-zinc-700 text-zinc-400 rounded-lg text-sm hover:border-zinc-600 transition-colors">
                ← 이전
              </button>
              <button
                onClick={() => setStep("techstack")}
                disabled={!description.trim()}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg font-medium transition-colors">
                다음 — 기술 스택 →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP "techstack": 기술 스택 선택 ── */}
        {step === "techstack" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">기술 스택 선택</h2>
              <p className="text-zinc-400 text-sm">
                프로젝트에 사용할 기술을 선택해주세요. CLAUDE.md 생성 시 자동으로 반영됩니다.
                없거나 모르면 건너뛰어도 됩니다.
              </p>
            </div>

            <div className="space-y-5">
              {(Object.keys(TECH_OPTIONS) as (keyof Omit<TechStack, "other">)[]).map((category) => (
                <div key={category}>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                    {TECH_LABELS[category]}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {TECH_OPTIONS[category].map((opt) => {
                      const selected = techStack[category].includes(opt);
                      return (
                        <button
                          key={opt}
                          onClick={() => toggleTechStack(category, opt)}
                          className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                            selected
                              ? "bg-blue-600 border-blue-500 text-white"
                              : "bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500"
                          }`}>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* 기타 직접 입력 */}
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                  기타 (직접 입력)
                </p>
                <input
                  type="text"
                  value={techStack.other}
                  onChange={(e) => setTechStack((prev) => ({ ...prev, other: e.target.value }))}
                  placeholder="예: Redis, RabbitMQ, tRPC 등"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(2)}
                className="px-4 py-3 border border-zinc-700 text-zinc-400 rounded-lg text-sm hover:border-zinc-600 transition-colors">
                ← 이전
              </button>
              <button
                onClick={() => { setStep(3); generateQuestions(); }}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">
                질문 생성하기 →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: 질문 생성 중 ── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">질문 생성 중</h2>
              <p className="text-zinc-400 text-sm">
                프로젝트 맥락에 맞는 질문을 AI가 구성하고 있습니다.
              </p>
            </div>

            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
              <TerminalStream
                active={generatingQ || qDone}
                done={qDone}
                streamText={rawBuffer}
              />
            </div>

            {!generatingQ && questions.length === 0 && rawBuffer && (
              <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
                파싱 실패.
                <button onClick={generateQuestions}
                  className="ml-3 px-3 py-1 bg-red-900 hover:bg-red-800 rounded-lg text-xs">
                  재시도
                </button>
              </div>
            )}

            {!generatingQ && (
              <div className="flex gap-3">
                <button onClick={() => setStep("techstack")}
                  className="px-4 py-3 border border-zinc-700 text-zinc-400 rounded-lg text-sm hover:border-zinc-600 transition-colors">
                  ← 이전
                </button>
                {questions.length > 0 && (
                  <button onClick={() => setStep(4)}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">
                    답변하기 →
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: 답변 ── */}
        {step === 4 && (
          <div className="space-y-8">
            <div>
              <h2 className="text-lg font-semibold mb-1">프로젝트 질문</h2>
              <p className="text-zinc-400 text-sm">모든 질문에 답변해주세요.</p>
            </div>

            {questions.map((q, i) => {
              const answer = answers[q.id];
              const customVal = customInputs[q.id] ?? "";
              const isAnswered =
                customVal.trim() ||
                (q.type === "single" ? !!answer : Array.isArray(answer) && answer.length > 0);

              return (
                <div key={q.id} className="space-y-3">
                  <p className="text-sm font-medium text-zinc-200 flex items-start gap-2">
                    <span className="text-zinc-500 shrink-0">Q{i + 1}.</span>
                    <span>
                      {q.question}
                      <span className="ml-2 text-xs text-zinc-600">
                        ({q.type === "single" ? "단일 선택" : "복수 선택"})
                      </span>
                      {isAnswered && <span className="ml-2 text-xs text-green-500">✓</span>}
                    </span>
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {q.options.map((opt) => {
                      const selected =
                        q.type === "single"
                          ? answer === opt
                          : (answer as string[] | undefined)?.includes(opt);
                      return (
                        <button key={opt} onClick={() => toggleAnswer(q.id, opt, q.type)}
                          className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                            selected ? "bg-blue-600 border-blue-500 text-white"
                              : "bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500"
                          }`}>
                          {opt}
                        </button>
                      );
                    })}
                  </div>

                  <input
                    type="text"
                    value={customVal}
                    onChange={(e) => setCustomInputs((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="직접 입력 (선택 사항)"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                  />
                </div>
              );
            })}

            <div className="flex gap-3 pt-4">
              <button onClick={() => setStep(3)}
                className="px-4 py-3 border border-zinc-700 text-zinc-400 rounded-lg text-sm hover:border-zinc-600 transition-colors">
                ← 이전
              </button>
              <button onClick={saveAnswers} disabled={!allAnswered || saving}
                className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg font-medium transition-colors">
                {saving ? "저장 중..." : "완료 — PRD 생성하기 →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ─── 분석 결과 카드 ───────────────────────────────────────────
function AnalysisCard({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
      <p className={`text-xs font-semibold uppercase tracking-widest mb-2 ${color}`}>{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-zinc-400 leading-relaxed flex gap-2">
            <span className={`${color} opacity-60 shrink-0`}>·</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
