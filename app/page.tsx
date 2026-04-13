"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Home() {
  const router = useRouter();
  const [hasProject, setHasProject] = useState<boolean | null>(null);

  // .harness/project.json 존재 여부 확인
  useEffect(() => {
    fetch("/api/project")
      .then((r) => r.json())
      .then((d) => setHasProject(d.exists))
      .catch(() => setHasProject(false));
  }, []);

  if (hasProject === null) return null; // 로딩 중

  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-zinc-100">Harness Dashboard</h1>
        <p className="text-zinc-500 mt-2 text-sm">
          로컬 AI 기획 대시보드 — claude -p 연동
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={() => router.push("/onboarding")}
          className="py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
        >
          {hasProject ? "온보딩 다시 시작" : "새 프로젝트 시작"}
        </button>

        {hasProject && (
          <button
            onClick={() => router.push("/prd")}
            className="py-3 border border-zinc-700 hover:border-zinc-500 text-zinc-300 rounded-lg font-medium transition-colors"
          >
            PRD 보기 →
          </button>
        )}
      </div>

      {/* 연결 상태 */}
      <div className="flex items-center gap-2 text-xs text-zinc-600">
        <span className="w-2 h-2 rounded-full bg-green-500" />
        로컬 Claude Code 연결됨
      </div>
    </main>
  );
}
