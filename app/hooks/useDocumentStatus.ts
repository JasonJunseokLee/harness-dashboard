"use client"

import { useState, useEffect, useCallback } from 'react'

export type DocType = 'features' | 'prd' | 'workflow' | 'sprint-plan'

export type FeatureNodeStatus = 'todo' | 'in-progress' | 'done' | 'blocked' | 'dropped'
export type FlowStatus = 'todo' | 'in-progress' | 'done' | 'blocked'

export interface FeaturesStatus {
  version: number
  updatedAt: string
  nodes: Record<string, { status: FeatureNodeStatus; note: string; updatedAt: string }>
}

export interface PrdStatus {
  version: number
  updatedAt: string
  needsReview: boolean
  driftNotes: Array<{ id: string; section: string; note: string; createdAt: string }>
}

export interface WorkflowStatus {
  version: number
  updatedAt: string
  flows: Record<string, { status: FlowStatus; note: string; updatedAt: string }>
}

export interface SprintPlanStatus {
  version: number
  updatedAt: string
  sprints: Record<string, { done: boolean; note: string; updatedAt: string }>
}

type StatusMap = {
  features: FeaturesStatus
  prd: PrdStatus
  workflow: WorkflowStatus
  'sprint-plan': SprintPlanStatus
}

export function useDocumentStatus<T extends DocType>(doc: T) {
  const [status, setStatus] = useState<StatusMap[T] | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/document-status?doc=${doc}`)
      const data = await res.json()
      setStatus(data)
    } catch {
      // 네트워크 오류 무시
    } finally {
      setLoading(false)
    }
  }, [doc])

  useEffect(() => { load() }, [load])

  // 부분 업데이트: 로컬 state 낙관적 반영 후 서버 저장
  const update = useCallback(async (patch: Partial<StatusMap[T]>) => {
    setStatus(prev => prev ? { ...prev, ...patch } : null)
    try {
      await fetch(`/api/document-status?doc=${doc}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch {
      // 실패 시 재로드로 복구
      load()
    }
  }, [doc, load])

  return { status, loading, update, reload: load }
}
