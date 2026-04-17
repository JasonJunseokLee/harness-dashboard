"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import TerminalStream from "@/app/components/TerminalStream";
import { useAI } from "@/app/context/AIContext";
import { PrdStatusBanner } from "@/app/components/StatusBanner";
import { useDocumentStatus } from "@/app/hooks/useDocumentStatus";

// ─── 타입 ────────────────────────────────────────────────────
type PRDData = {
  overview: {
    oneLiner: string;
    problem: string;
    solution: string;
    differentiation: string;
  };
  target: {
    users: string;
    scenario: string;
  };
  success: {
    kpis: string[];
    risks: string[];
  };
  attributes: {
    roles: string[];
    devices: string[];
  };
};

// ─── 섹션 카드 컴포넌트 ──────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-3">
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Body({ text }: { text: string }) {
  return <p className="text-sm text-zinc-300 leading-relaxed">{text}</p>;
}

// ─── PRD 뷰어 ────────────────────────────────────────────────
function PRDViewer({ prd }: { prd: PRDData }) {
  return (
    <div className="space-y-4">
      {/* 핵심 가치 */}
      <Section title="개요 — 한 줄 정의">
        <Body text={prd.overview.oneLiner} />
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Section title="사용자 문제">
          <Body text={prd.overview.problem} />
        </Section>
        <Section title="해결 방식">
          <Body text={prd.overview.solution} />
        </Section>
        <Section title="차별점">
          <Body text={prd.overview.differentiation} />
        </Section>
      </div>

      {/* 타겟 & 시나리오 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="타겟 사용자">
          <Body text={prd.target.users} />
        </Section>
        <Section title="사용 시나리오">
          <Body text={prd.target.scenario} />
        </Section>
      </div>

      {/* 성공 지표 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="핵심 KPI">
          <ul className="space-y-2">
            {prd.success.kpis.map((kpi, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-300">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>{kpi}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="리스크 / 이슈">
          <ul className="space-y-2">
            {prd.success.risks.map((risk, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-300">
                <span className="text-yellow-500 mt-0.5">⚠</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {/* 속성 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="사용자 역할">
          <div className="flex flex-wrap gap-2">
            {prd.attributes.roles.map((r) => (
              <span key={r} className="px-3 py-1 bg-zinc-800 rounded-full text-xs text-zinc-300 border border-zinc-700">
                {r}
              </span>
            ))}
          </div>
        </Section>
        <Section title="기기 / 환경">
          <div className="flex flex-wrap gap-2">
            {prd.attributes.devices.map((d) => (
              <span key={d} className="px-3 py-1 bg-zinc-800 rounded-full text-xs text-zinc-300 border border-zinc-700">
                {d}
              </span>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

// ─── PRD 페이즈 프리셋 ────────────────────────────────────────
const PRD_PRESETS = [
  "사용자 문제를 더 구체적으로",
  "KPI 숫자 목표 추가",
  "리스크 3개 더 추가",
  "차별점 강화",
];

// ─── 메인 페이지 ─────────────────────────────────────────────
export default function PRDPage() {
  const router = useRouter();
  const [prd, setPrd] = useState<PRDData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genDone, setGenDone] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const [hasProject, setHasProject] = useState(true);

  // PRD 상태 (drift 노트, 재검토 여부)
  const { status: prdStatus, update: updatePrdStatus } = useDocumentStatus('prd');

  // 글로벌 AI Context
  const { setPhase, setPresets, setCurrentContent, registerContentUpdater, unregisterContentUpdater } = useAI();

  // 저장된 PRD + 프로젝트 정보 불러오기
  useEffect(() => {
    setPhase("prd");
    setPresets(["타겟 사용자 구체화", "성공 지표 추가", "기능 우선순위 재정렬", "비기능 요구사항 강화"]);
    fetch("/api/prd")
      .then((r) => r.json())
      .then((d) => { if (d.exists) setPrd(d.data); });
    fetch("/api/project")
      .then((r) => r.json())
      .then((d) => setHasProject(d.exists));
  }, [setPhase, setPresets]);

  // 글로벌 AI Context에 PRD 콘텐츠 등록
  // AIDrawer에서 PRD를 수정하면 setPrd가 호출됨
  useEffect(() => {
    setCurrentContent(prd);
    registerContentUpdater(setPrd);
    return () => unregisterContentUpdater();
  }, [prd, setCurrentContent, registerContentUpdater, unregisterContentUpdater]);

  // PRD 생성 (SSE 스트리밍)
  async function generatePRD() {
    setGenerating(true);
    setGenDone(false);
    setStreamText("");
    setError("");
    setPrd(null);

    const res = await fetch("/api/prd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: "" }),
    });
    if (!res.ok) {
      setError("온보딩을 먼저 완료해주세요.");
      setGenerating(false);
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

        if (event.type === "text") {
          setStreamText((prev) => prev + event.text);
        }
        if (event.type === "done") {
          if (event.prd) { setPrd(event.prd); setGenDone(true); }
          else setError(event.error ?? "파싱 실패");
        }
      }
    }
    setGenerating(false);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">PRD</h1>
            <p className="text-zinc-500 text-sm mt-1">제품 요구사항 문서</p>
          </div>

          <div className="flex gap-2">
            {prd && (
              <button
                onClick={generatePRD}
                disabled={generating}
                className="px-4 py-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 rounded-lg text-sm transition-colors"
              >
                재생성
              </button>
            )}
            {!prd && !generating && (
              <button
                onClick={hasProject ? generatePRD : () => router.push("/onboarding")}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {hasProject ? "PRD 생성하기" : "온보딩 먼저 하기"}
              </button>
            )}
          </div>
        </div>


        {/* 생성 중 — 진행률 표시 */}
        {(generating || genDone) && !error && (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 mb-6">
            <TerminalStream
              active={generating || genDone}
              done={genDone}
              streamText={streamText}
            />
          </div>
        )}

        {/* 오류 */}
        {error && (
          <div className="bg-red-950 border border-red-800 rounded-xl p-4 mb-6 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* PRD 상태 배너 (생성된 PRD가 있을 때만 표시) */}
        {prd && !generating && prdStatus && (
          <PrdStatusBanner
            needsReview={prdStatus.needsReview}
            driftNotes={prdStatus.driftNotes}
            onToggleReview={(v) => updatePrdStatus({ needsReview: v } as Parameters<typeof updatePrdStatus>[0])}
            onAddDrift={(note) => {
              const newNote = { id: `drift_${Date.now()}`, createdAt: new Date().toISOString(), ...note };
              updatePrdStatus({ driftNotes: [...(prdStatus.driftNotes ?? []), newNote] } as Parameters<typeof updatePrdStatus>[0]);
            }}
            onRemoveDrift={(id) => {
              updatePrdStatus({ driftNotes: prdStatus.driftNotes.filter(d => d.id !== id) } as Parameters<typeof updatePrdStatus>[0]);
            }}
          />
        )}

        {/* PRD 뷰어 */}
        {prd && !generating && (
          <div className="space-y-4">
            <PRDViewer prd={prd} />
          </div>
        )}

        {/* 빈 상태 */}
        {!prd && !generating && !error && (
          <div className="text-center py-24 text-zinc-600">
            <p className="text-4xl mb-4">📄</p>
            <p className="text-sm">
              {hasProject
                ? "PRD 생성하기 버튼을 눌러 시작하세요"
                : "온보딩을 먼저 완료해야 PRD를 생성할 수 있습니다"}
            </p>
          </div>
        )}

        {/* PRD 완료 후 다음 단계 안내 */}
        {prd && !generating && (
          <div className="mt-8 flex justify-end">
            <button
              onClick={() => router.push("/features")}
              className="px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors text-sm"
            >
              기능 명세서로 →
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
