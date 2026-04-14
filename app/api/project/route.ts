import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import { getHarnessDir } from '@/app/lib/project-path'

export const runtime = 'nodejs'

// 프로젝트 데이터 존재 여부 + 내용 반환
export async function GET() {
  // 매 요청마다 동적으로 조회 (프로젝트 전환 즉시 반영)
  const projectFile = path.join(getHarnessDir(), 'project.json')
  const exists = fs.existsSync(projectFile)
  if (!exists) return NextResponse.json({ exists: false })

  const data = JSON.parse(fs.readFileSync(projectFile, 'utf-8'))
  return NextResponse.json({ exists: true, data })
}
