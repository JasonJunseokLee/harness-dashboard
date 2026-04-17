"use client"

import { useState } from 'react'
import StatusBadge, { FlowStatus } from './StatusBadge'

// PRD용 배너
interface PrdBannerProps {
  needsReview: boolean
  driftNotes: Array<{ id: string; section: string; note: string; createdAt: string }>
  onToggleReview: (v: boolean) => void
  onAddDrift: (note: { section: string; note: string }) => void
  onRemoveDrift: (id: string) => void
}

export function PrdStatusBanner({ needsReview, driftNotes, onToggleReview, onAddDrift, onRemoveDrift }: PrdBannerProps) {
  const [adding, setAdding] = useState(false)
  const [section, setSection] = useState('')
  const [note, setNote] = useState('')

  return (
    <div className="mx-6 mt-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-400">PRD 상태</span>
        <button
          className={`flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 transition-colors ${needsReview ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'}`}
          onClick={() => onToggleReview(!needsReview)}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${needsReview ? 'bg-amber-400' : 'bg-zinc-600'}`} />
          {needsReview ? '재검토 필요' : '정상'}
        </button>
      </div>

      {/* 드리프트 노트 목록 */}
      {driftNotes.length > 0 && (
        <div className="space-y-2">
          {driftNotes.map(d => (
            <div key={d.id} className="flex items-start gap-2 text-xs bg-zinc-800/50 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                {d.section && <span className="text-zinc-500 mr-1">[{d.section}]</span>}
                <span className="text-zinc-300">{d.note}</span>
              </div>
              <button className="text-zinc-600 hover:text-red-400 shrink-0" onClick={() => onRemoveDrift(d.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* 드리프트 노트 추가 */}
      {adding ? (
        <div className="space-y-2">
          <input
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            placeholder="섹션 (선택, e.g. 타겟 사용자)"
            value={section}
            onChange={e => setSection(e.target.value)}
          />
          <textarea
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
            placeholder="변경된 내용 기록..."
            rows={2}
            value={note}
            onChange={e => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="text-xs bg-blue-700 hover:bg-blue-600 text-white rounded-lg px-3 py-1 transition-colors"
              onClick={() => {
                if (note.trim()) { onAddDrift({ section: section.trim(), note: note.trim() }); setSection(''); setNote(''); setAdding(false) }
              }}
            >저장</button>
            <button className="text-xs text-zinc-500 hover:text-zinc-300 px-2" onClick={() => setAdding(false)}>취소</button>
          </div>
        </div>
      ) : (
        <button
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          onClick={() => setAdding(true)}
        >
          + 기획 변경사항 기록
        </button>
      )}
    </div>
  )
}

// 워크플로우/스프린트 공용 배너
interface SimpleStatusBannerProps {
  label: string
  status: FlowStatus
  note?: string
  onChange: (status: FlowStatus, note?: string) => void
}

export function SimpleStatusBanner({ label, status, note, onChange }: SimpleStatusBannerProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note ?? '')

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900/50 border-b border-zinc-800">
      <span className="text-xs text-zinc-500 shrink-0">{label}</span>
      <StatusBadge
        status={status}
        type="flow"
        size="sm"
        onChange={s => onChange(s as FlowStatus, note)}
      />
      {editing ? (
        <div className="flex items-center gap-2 flex-1">
          <input
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-300 focus:outline-none"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { onChange(status, draft); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
            autoFocus
          />
          <button className="text-xs text-zinc-500 hover:text-zinc-300" onClick={() => { onChange(status, draft); setEditing(false) }}>저장</button>
        </div>
      ) : (
        <button className="text-xs text-zinc-600 hover:text-zinc-400 truncate max-w-xs" onClick={() => { setDraft(note ?? ''); setEditing(true) }}>
          {note || '+ 메모'}
        </button>
      )}
    </div>
  )
}
