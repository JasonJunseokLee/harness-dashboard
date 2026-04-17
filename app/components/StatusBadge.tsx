"use client"

import { useState, useRef, useEffect } from 'react'

export type NodeStatus = 'todo' | 'in-progress' | 'done' | 'blocked' | 'dropped'
export type FlowStatus = 'todo' | 'in-progress' | 'done' | 'blocked'

// 상태별 라벨 + 색상
export const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  'todo':        { label: '미시작',   bg: 'bg-zinc-800',    text: 'text-zinc-400', dot: 'bg-zinc-500' },
  'in-progress': { label: '진행 중',  bg: 'bg-blue-950',    text: 'text-blue-300', dot: 'bg-blue-400' },
  'done':        { label: '완료',     bg: 'bg-green-950',   text: 'text-green-300', dot: 'bg-green-400' },
  'blocked':     { label: '블락',     bg: 'bg-red-950',     text: 'text-red-300',  dot: 'bg-red-400' },
  'dropped':     { label: '드롭',     bg: 'bg-zinc-900',    text: 'text-zinc-600', dot: 'bg-zinc-700' },
}

const NODE_STATUS_OPTIONS: NodeStatus[] = ['todo', 'in-progress', 'done', 'blocked', 'dropped']
const FLOW_STATUS_OPTIONS: FlowStatus[] = ['todo', 'in-progress', 'done', 'blocked']

interface Props {
  status: string
  type?: 'node' | 'flow'       // 어떤 옵션 목록 사용할지
  onChange?: (status: string) => void
  size?: 'sm' | 'md'
}

export default function StatusBadge({ status, type = 'node', onChange, size = 'sm' }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG['todo']
  const options = type === 'flow' ? FLOW_STATUS_OPTIONS : NODE_STATUS_OPTIONS

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const padding = size === 'md' ? 'px-2.5 py-1' : 'px-1.5 py-0.5'
  const textSize = size === 'md' ? 'text-xs' : 'text-[10px]'

  return (
    <div ref={ref} className="relative inline-block">
      <button
        className={`flex items-center gap-1 rounded-full ${padding} ${cfg.bg} ${cfg.text} ${textSize} font-medium transition-opacity ${onChange ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
        onClick={(e) => {
          e.stopPropagation()
          if (onChange) setOpen(v => !v)
        }}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
        {cfg.label}
      </button>

      {/* 상태 선택 드롭다운 */}
      {open && onChange && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden min-w-[90px]">
          {options.map(opt => {
            const c = STATUS_CONFIG[opt]
            return (
              <button
                key={opt}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-800 transition-colors ${opt === status ? 'bg-zinc-800' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(opt)
                  setOpen(false)
                }}
              >
                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                <span className={c.text}>{c.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
