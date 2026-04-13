"use client";

// ─── AI 지시사항 입력창 ── 생성/재생성 버튼 아래 공통 사용 ────────
interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function InstructionInput({ value, onChange, disabled, placeholder }: Props) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 pt-3 pb-3">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">
        AI 지시사항{" "}
        <span className="text-zinc-700 font-normal normal-case tracking-normal">
          (선택 — 생성·재생성 시 반영됩니다)
        </span>
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={
          placeholder ??
          "예: B2B 기업 고객에 집중해줘. KPI는 월간 구독 매출과 이탈률로. 타겟 사용자를 더 구체적으로 작성해줘."
        }
        rows={2}
        className="w-full bg-transparent text-sm text-zinc-300 placeholder-zinc-600 resize-none focus:outline-none disabled:opacity-40 leading-relaxed"
      />
    </div>
  );
}
