import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import { getHarnessDir, getTargetProjectPath } from '@/app/lib/project-path'

export const runtime = 'nodejs'

// 각 단계별 완료 여부를 파일 존재로 판단
export async function GET() {
  const HARNESS = getHarnessDir()
  const targetPath = getTargetProjectPath()

  // 실제 프로젝트에 연결된 경우인지 확인
  // HARNESS_TARGET 환경변수 또는 ~/.harness-launch.json 이 있어야 진짜 연결 상태
  const hasEnvTarget = !!process.env.HARNESS_TARGET
  const launchJsonPath = path.join(process.env.HOME || '~', '.harness-launch.json')
  const hasLaunchJson = fs.existsSync(launchJsonPath)
  const isLinked = hasEnvTarget || hasLaunchJson

  return NextResponse.json({
    onboarding: fs.existsSync(path.join(HARNESS, 'project.json')),
    prd: fs.existsSync(path.join(HARNESS, 'prd.json')),
    features: fs.existsSync(path.join(HARNESS, 'features.json')),
    workflow: fs.existsSync(path.join(HARNESS, 'workflow.json')),
    setup: fs.existsSync(path.join(HARNESS, 'setup.json')),
    sprintPlan: fs.existsSync(path.join(HARNESS, 'sprint-plan.md')),
    // 현재 연결된 프로젝트 경로 (사용자에게 저장 위치 인지시키기 위해 포함)
    targetPath,
    projectName: path.basename(targetPath),
    harnessDir: HARNESS,
    isLinked, // false면 fallback 상태 → 사용자에게 경고 표시
  })
}
