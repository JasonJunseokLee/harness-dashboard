"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Status = {
  onboarding: boolean;
  prd: boolean;
  features: boolean;
  workflow: boolean;
  setup: boolean;
  sprintPlan: boolean;
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

  // 단계 완료 상태 로드
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, [pathname]); // 페이지 이동할 때마다 갱신

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
      <nav className="flex-1 px-3 py-4 space-y-1">
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
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 하단 — claude 연결 상태 */}
      <div className="px-5 py-4 border-t border-zinc-800">
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          Claude Code 연결됨
        </div>
      </div>
    </aside>
  );
}
