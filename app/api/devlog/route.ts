import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import { getHarnessDir } from '@/app/lib/project-path'

export const runtime = 'nodejs'

// devlog 항목 파싱 (## ISO타임스탬프 \n 메시지 형식)
function parseEntries(content: string) {
  const blocks = content.split(/^## /m).filter(Boolean)
  return blocks.map(block => {
    const newline = block.indexOf('\n')
    const ts = block.slice(0, newline).trim()
    const message = block.slice(newline + 1).trim()
    return { ts, message }
  }).filter(e => e.ts && e.message).reverse() // 최신순
}

// GET: devlog 전체 읽기
export async function GET() {
  const HARNESS = getHarnessDir()
  const LOG_FILE = path.join(HARNESS, 'devlog.md')
  if (!fs.existsSync(LOG_FILE)) return NextResponse.json({ entries: [] })
  const content = fs.readFileSync(LOG_FILE, 'utf-8')
  return NextResponse.json({ entries: parseEntries(content) })
}

// POST: 항목 추가
export async function POST(req: NextRequest) {
  const { message } = await req.json()
  if (!message?.trim()) return NextResponse.json({ error: '메시지가 없습니다.' }, { status: 400 })

  const HARNESS = getHarnessDir()
  const LOG_FILE = path.join(HARNESS, 'devlog.md')
  if (!fs.existsSync(HARNESS)) fs.mkdirSync(HARNESS, { recursive: true })

  const ts = new Date().toISOString()
  const entry = `\n## ${ts}\n${message.trim()}\n`
  fs.appendFileSync(LOG_FILE, entry, 'utf-8')

  return NextResponse.json({ success: true, ts })
}

// DELETE: 전체 초기화
export async function DELETE() {
  const HARNESS = getHarnessDir()
  const LOG_FILE = path.join(HARNESS, 'devlog.md')
  if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE)
  return NextResponse.json({ success: true })
}
