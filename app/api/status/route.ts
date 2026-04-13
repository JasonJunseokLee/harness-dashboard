import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import { getHarnessDir } from '@/app/lib/project-path'

export const runtime = 'nodejs'

// 각 단계별 완료 여부를 파일 존재로 판단
export async function GET() {
  const HARNESS = getHarnessDir()
  return NextResponse.json({
    onboarding: fs.existsSync(path.join(HARNESS, 'project.json')),
    prd: fs.existsSync(path.join(HARNESS, 'prd.json')),
    features: fs.existsSync(path.join(HARNESS, 'features.json')),
    workflow: fs.existsSync(path.join(HARNESS, 'workflow.json')),
    setup: fs.existsSync(path.join(HARNESS, 'setup.json')),
    sprintPlan: fs.existsSync(path.join(HARNESS, 'sprint-plan.md')),
  })
}
