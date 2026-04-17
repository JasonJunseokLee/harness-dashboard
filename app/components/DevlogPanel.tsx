"use client"

import { useState, useEffect, useCallback } from 'react'

interface LogEntry {
  ts: string
  message: string
}

// 타임스탬프를 읽기 쉬운 형식으로 변환
function formatTs(ts: string) {
  try {
    const d = new Date(ts)
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return ts }
}

export default function DevlogPanel() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/devlog')
      const data = await res.json()
      setEntries(data.entries ?? [])
    } catch { /* 무시 */ }
  }, [])

  useEffect(() => { load() }, [load])

  async function submit() {
    if (!input.trim() || saving) return
    setSaving(true)
    try {
      await fetch('/api/devlog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input.trim() }),
      })
      setInput('')
      await load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-zinc-800 pt-3">
      {/* 헤더 — 클릭으로 로그 목록 펼치기/접기 */}
      <button
        className="w-full flex items-center justify-between px-1 mb-2 group"
        onClick={() => setExpanded(v => !v)}
      >
        <span className="text-[10px] text-zinc-600 uppercase tracking-wider group-hover:text-zinc-400 transition-colors">
          Dev Log {entries.length > 0 && `(${entries.length})`}
        </span>
        <span className="text-zinc-700 group-hover:text-zinc-400 transition-colors text-xs">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* 로그 목록 */}
      {expanded && entries.length > 0 && (
        <div className="mb-2 max-h-32 overflow-y-auto space-y-1.5 pr-1">
          {entries.slice(0, 10).map((e, i) => (
            <div key={i} className="text-[10px] leading-relaxed">
              <span className="text-zinc-700 block">{formatTs(e.ts)}</span>
              <span className="text-zinc-400">{e.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* 빠른 입력창 */}
      <div className="flex gap-1.5 items-end">
        <textarea
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[11px] text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none leading-relaxed"
          placeholder="개발 중 생긴 일 기록..."
          rows={2}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          }}
        />
        <button
          className="shrink-0 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg px-2 py-1.5 text-[10px] transition-colors disabled:opacity-40"
          onClick={submit}
          disabled={saving || !input.trim()}
        >
          {saving ? '...' : '기록'}
        </button>
      </div>
      <div className="text-[9px] text-zinc-700 mt-1">⌘Enter로 빠른 저장</div>
    </div>
  )
}
