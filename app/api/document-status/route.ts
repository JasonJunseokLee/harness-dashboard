import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import { getHarnessDir } from '@/app/lib/project-path'

export const runtime = 'nodejs'

// 허용된 문서 타입
const ALLOWED_DOCS = ['features', 'prd', 'workflow', 'sprint-plan'] as const
type DocType = typeof ALLOWED_DOCS[number]

// 문서별 기본 status 구조
function defaultStatus(doc: DocType) {
  const base = { version: 1, updatedAt: new Date().toISOString() }
  switch (doc) {
    case 'features':   return { ...base, nodes: {} }
    case 'prd':        return { ...base, needsReview: false, driftNotes: [] }
    case 'workflow':   return { ...base, flows: {} }
    case 'sprint-plan': return { ...base, sprints: {} }
  }
}

function getStatusPath(doc: DocType) {
  return path.join(getHarnessDir(), `${doc}.status.json`)
}

// GET: 해당 문서의 status 반환 (없으면 기본값)
export async function GET(req: NextRequest) {
  const doc = req.nextUrl.searchParams.get('doc') as DocType | null
  if (!doc || !ALLOWED_DOCS.includes(doc)) {
    return NextResponse.json({ error: '유효하지 않은 doc 파라미터' }, { status: 400 })
  }

  const filePath = getStatusPath(doc)
  if (!fs.existsSync(filePath)) {
    return NextResponse.json(defaultStatus(doc))
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(defaultStatus(doc))
  }
}

// PUT: status 업데이트 (기존 데이터에 merge)
export async function PUT(req: NextRequest) {
  const doc = req.nextUrl.searchParams.get('doc') as DocType | null
  if (!doc || !ALLOWED_DOCS.includes(doc)) {
    return NextResponse.json({ error: '유효하지 않은 doc 파라미터' }, { status: 400 })
  }

  const body = await req.json()
  const HARNESS = getHarnessDir()
  if (!fs.existsSync(HARNESS)) fs.mkdirSync(HARNESS, { recursive: true })

  const filePath = getStatusPath(doc)
  const existing = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    : defaultStatus(doc)

  const updated = { ...existing, ...body, updatedAt: new Date().toISOString() }
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8')

  return NextResponse.json({ success: true, data: updated })
}
