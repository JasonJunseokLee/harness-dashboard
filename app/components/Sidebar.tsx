"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import DevlogPanel from "./DevlogPanel";

type Status = {
  onboarding: boolean;
  prd: boolean;
  features: boolean;
  workflow: boolean;
  setup: boolean;
  sprintPlan: boolean;
  targetPath?: string;
  projectName?: string;
  harnessDir?: string;
  isLinked?: boolean;
};

// 기능 진행률 요약
type FeatureProgress = {
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
};

const NAV = [
  { href: "/onboarding",   label: "온보딩",        key: "onboarding" as keyof Status,  num: "01" },
  { href: "/prd",          label: "PRD",           key: "prd" as keyof Status,          num: "02" },
  { href: "/features",     label: "기능 명세서",    key: "features" as keyof Status,     num: "03" },
  { href: "/workflow",     label: "유저 워크플로우", key: "workflow" as keyof Status,     num: "04" },
  { href: "/setup",        label: "하네스 세팅",    key: "setup" as keyof Status,        num: "05" },
  { href: "/sprint-plan",  label: "스프린트 플랜",  key: "sprintPlan" as keyof Status,   num: "06" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [status, setStatus] = useState<Status>({
    onboarding: false,
    prd: false,
    features: false,
    workflow: false,
    setup: false,
    sprintPlan: false,
  });
  const [featureProgress, setFeatureProgress] = useState<FeatureProgress | null>(null);

  // 단계 완료 상태 + 기능 진행률 로드
  useEffect(() => {
    // 두 API 병렬 호출
    Promise.all([
      fetch("/api/status").then(r => r.json()).catch(() => ({})),
      fetch("/api/document-status?doc=features").then(r => r.json()).catch(() => null),
      fetch("/api/features").then(r => r.json()).catch(() => null),
    ]).then(([s, featStatus, featData]) => {
      if (s) setStatus(s);

      // 기능 진행률 계산
      if (featData?.exists && featStatus?.nodes) {
        const nodes = (featData.data?.treeNodes ?? []) as Array<{ id: string; type: string }>;
        const featureNodes = nodes.filter((n) => n.type === 'feature' || n.type === 'subfeature');
        const total = featureNodes.length;
        const statusNodes = featStatus.nodes as Record<string, { status: string }>;
        const done = featureNodes.filter(n => statusNodes[n.id]?.status === 'done').length;
        const inProgress = featureNodes.filter(n => statusNodes[n.id]?.status === 'in-progress').length;
        const blocked = featureNodes.filter(n => statusNodes[n.id]?.status === 'blocked').length;
        if (total > 0) setFeatureProgress({ total, done, inProgress, blocked });
      }
    });
  }, [pathname]);

  return (
    <aside className="w-56 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col h-screen sticky top-0">
      {/* 로고 */}
      <div className="px-5 py-5 border-b border-zinc-800">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-sm font-bold text-zinc-100">Harness</span>
          <span className="text-xs text-zinc-500">Dashboard</span>
        </Link>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const isDone = status[item.key];

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
              }`}
            >
              {/* 완료 표시 */}
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  isDone
                    ? "bg-green-600 text-white"
                    : isActive
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-800 text-zinc-600"
                }`}
              >
                {isDone ? "✓" : item.num}
              </span>
              <span className="flex-1">{item.label}</span>
              {/* 기능명세서에 진행률 미니 표시 */}
              {item.key === 'features' && featureProgress && (
                <span className="text-[10px] text-green-500 shrink-0">
                  {featureProgress.done}/{featureProgress.total}
                </span>
              )}
            </Link>
          );
        })}

        {/* 기능 진행률 바 */}
        {featureProgress && featureProgress.total > 0 && (
          <div className="px-3 pt-2 pb-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-zinc-600">구현 진행률</span>
              <span className="text-[10px] text-zinc-500">
                {Math.round((featureProgress.done / featureProgress.total) * 100)}%
              </span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden flex">
              {/* done */}
              <div
                className="h-full bg-green-600 transition-all"
                style={{ width: `${(featureProgress.done / featureProgress.total) * 100}%` }}
              />
              {/* in-progress */}
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${(featureProgress.inProgress / featureProgress.total) * 100}%` }}
              />
              {/* blocked */}
              <div
                className="h-full bg-red-700 transition-all"
                style={{ width: `${(featureProgress.blocked / featureProgress.total) * 100}%` }}
              />
            </div>
            <div className="flex gap-2 mt-1 text-[9px] text-zinc-700">
              <span className="text-green-600">■ 완료 {featureProgress.done}</span>
              {featureProgress.inProgress > 0 && <span className="text-blue-600">■ 진행 {featureProgress.inProgress}</span>}
              {featureProgress.blocked > 0 && <span className="text-red-600">■ 블락 {featureProgress.blocked}</span>}
            </div>
          </div>
        )}
      </nav>

      {/* 하단 — devlog + 프로젝트 경로 + claude 상태 */}
      <div className="px-4 py-4 border-t border-zinc-800 space-y-3">

        {/* Dev Log 빠른 입력 */}
        <DevlogPanel />

        {/* 연결된 프로젝트 경로 */}
        <div>
          <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">저장 위치</div>
          {status.isLinked && status.harnessDir ? (
            <div title={status.harnessDir}>
              <span className="font-semibold text-zinc-200 text-[11px]">{status.projectName}</span>
              <span className="block text-zinc-600 text-[10px] mt-0.5 break-all leading-relaxed">
                {status.harnessDir}
              </span>
            </div>
          ) : (
            <div className="rounded-md bg-amber-950/60 border border-amber-800/50 px-2.5 py-2">
              <div className="text-amber-400 text-[11px] font-semibold mb-1">⚠ 프로젝트 미연결</div>
              <div className="text-zinc-500 text-[10px] leading-relaxed">
                작업 결과가 대시보드 폴더에 저장됩니다.
                <br />
                프로젝트 폴더에서 <span className="text-zinc-300 font-mono">/harness</span> 를 실행하세요.
              </div>
            </div>
          )}
        </div>

        {/* Claude Code 연결 상태 */}
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          Claude Code 연결됨
        </div>
      </div>
    </aside>
  );
}
