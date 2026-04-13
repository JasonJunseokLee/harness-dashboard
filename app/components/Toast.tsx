"use client";

// 가벼운 토스트 — 외부 라이브러리 없이 우측 상단 슬라이드인
import { useEffect } from "react";

export type ToastKind = "success" | "error" | "info";

export type ToastMsg = {
  id: string;
  kind: ToastKind;
  text: string;
};

const KIND_STYLE: Record<ToastKind, string> = {
  success: "border-emerald-700 bg-emerald-950 text-emerald-200",
  error: "border-red-800 bg-red-950 text-red-200",
  info: "border-zinc-700 bg-zinc-900 text-zinc-200",
};

const KIND_ICON: Record<ToastKind, string> = {
  success: "✓",
  error: "!",
  info: "i",
};

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastMsg[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMsg;
  onDismiss: (id: string) => void;
}) {
  // 4초 후 자동 사라짐
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  return (
    <div
      className={`toast-in pointer-events-auto flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border text-xs font-medium shadow-lg max-w-sm ${KIND_STYLE[toast.kind]}`}
    >
      <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px] font-bold shrink-0">
        {KIND_ICON[toast.kind]}
      </span>
      <span className="leading-snug">{toast.text}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="ml-1 text-zinc-500 hover:text-zinc-200 transition-colors"
        aria-label="닫기"
      >
        ×
      </button>
    </div>
  );
}
