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

// Step 순서: 1=컨텍스트, analysis=분석, 2=프로젝트설명, techstack=기술스택, 3=질문생성, 4=답변
type Step = 1 | "analysis" | 2 | "techstack" | 3 | 4;

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
  const [step, setStep] = useState<Step>(1);

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
  const [qError, setQError] = useState("");

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
    setQError("");

    let res: Response;
    try {
      res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_questions", description }),
      });
    } catch {
      setQError("서버 연결 실패. 대시보드가 실행 중인지 확인하세요.");
      setGeneratingQ(false);
      return;
    }

    // API 에러 응답 처리 (SSE 아닌 JSON 에러)
    if (!res.ok) {
      const errText = await res.text().catch(() => "알 수 없는 오류");
      setQError(`질문 생성 실패 (${res.status}): ${errText}`);
      setGeneratingQ(false);
      return;
    }

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
        try {
          const event = JSON.parse(json);
          if (event.type === "text") {
            accumulated += event.text;
            setRawBuffer(accumulated);
          }
          if (event.type === "error") {
            setQError(event.text || "claude 실행 오류");
          }
          if (event.type === "done") {
            try {
              const cleaned = accumulated.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
              const parsed = JSON.parse(cleaned);
              setQuestions(parsed.questions ?? []);
              setQDone(true);
            } catch {
              setQError("질문 파싱 실패. 재시도해주세요.");
              console.error("질문 파싱 실패:", accumulated);
            }
          }
        } catch {
          // JSON 파싱 실패한 SSE 라인 무시
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

  // ─── 시각 단계 계산 (5단계) ──────────────────────────────
  const visualStep =
    step === 1 ? 1
    : step === "analysis" ? 1
    : step === 2 ? 2
    : step === "techstack" ? 3
    : step === 3 ? 4
    : 5; // step 4

  // ─── 렌더링 ───────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-start py-12 px-4">
      <div className="w-full max-w-2xl">
        {/* 헤더 */}
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

            {/* 에러 표시 (API 오류 또는 파싱 실패) */}
            {!generatingQ && qError && (
              <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
                {qError}
                <button onClick={generateQuestions}
                  className="ml-3 px-3 py-1 bg-red-900 hover:bg-red-800 rounded-lg text-xs">
                  재시도
                </button>
              </div>
            )}
            {/* 레거시: rawBuffer는 있는데 파싱만 실패한 경우 */}
            {!generatingQ && !qError && questions.length === 0 && rawBuffer && (
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
