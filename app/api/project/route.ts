import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

export const runtime = 'nodejs'

const PROJECT_FILE = path.join(process.cwd(), '.harness', 'project.json')

// 프로젝트 데이터 존재 여부 + 내용 반환
export async function GET() {
  const exists = fs.existsSync(PROJECT_FILE)
  if (!exists) return NextResponse.json({ exists: false })

  const data = JSON.parse(fs.readFileSync(PROJECT_FILE, 'utf-8'))
  return NextResponse.json({ exists: true, data })
}
