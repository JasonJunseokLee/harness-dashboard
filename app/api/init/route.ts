import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import {
  getTargetProjectPath,
  getSessionInfo,
  setTargetProjectPath,
  getHarnessDir,
} from '@/app/lib/project-path'

export const runtime = 'nodejs'

interface InitResponse {
  targetProjectPath: string
  projectName: string
  existing: {
    project: boolean
    prd: boolean
    features: boolean
    workflow: boolean
    setup: boolean
    sprintPlan: boolean
    claudeMd: boolean
  }
  existingMeta: {
    projectCreatedAt?: string
    prdGeneratedAt?: string
    sprintPlanGeneratedAt?: string
  }
}

/**
 * GET /api/init
 * 현재 세션의 대상 프로젝트 경로와 기존 파일 현황 반환
 */
export async function GET(): Promise<NextResponse<InitResponse>> {
  const sessionInfo = getSessionInfo()
  const harnessDir = getHarnessDir()
  const targetPath = getTargetProjectPath()

  // 각 파일의 존재 여부 확인
  const projectJsonPath = path.join(harnessDir, 'project.json')
  const prdJsonPath = path.join(harnessDir, 'prd.json')
  const featuresJsonPath = path.join(harnessDir, 'features.json')
  const workflowJsonPath = path.join(harnessDir, 'workflow.json')
  const setupJsonPath = path.join(harnessDir, 'setup.json')
  const sprintPlanPath = path.join(harnessDir, 'sprint-plan.md')
  const claudeMdPath = path.join(targetPath, 'CLAUDE.md')

  // 메타데이터 수집
  const existingMeta: Record<string, string> = {}
  if (fs.existsSync(projectJsonPath)) {
    try {
      const projectData = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'))
      if (projectData.createdAt) {
        existingMeta.projectCreatedAt = projectData.createdAt
      }
    } catch {}
  }

  if (fs.existsSync(prdJsonPath)) {
    try {
      const prdData = JSON.parse(fs.readFileSync(prdJsonPath, 'utf-8'))
      if (prdData.generatedAt) {
        existingMeta.prdGeneratedAt = prdData.generatedAt
      }
    } catch {}
  }

  if (fs.existsSync(sprintPlanPath)) {
    try {
      const stat = fs.statSync(sprintPlanPath)
      existingMeta.sprintPlanGeneratedAt = stat.mtime.toISOString()
    } catch {}
  }

  const response: InitResponse = {
    targetProjectPath: sessionInfo.targetProjectPath,
    projectName: sessionInfo.projectName,
    existing: {
      project: fs.existsSync(projectJsonPath),
      prd: fs.existsSync(prdJsonPath),
      features: fs.existsSync(featuresJsonPath),
      workflow: fs.existsSync(workflowJsonPath),
      setup: fs.existsSync(setupJsonPath),
      sprintPlan: fs.existsSync(sprintPlanPath),
      claudeMd: fs.existsSync(claudeMdPath),
    },
    existingMeta: existingMeta as any,
  }

  return NextResponse.json(response)
}

/**
 * POST /api/init
 * 실행 중인 대시보드 세션에서 대상 프로젝트 경로 전환
 *
 * Request body:
 * {
 *   "targetProjectPath": "/absolute/path/to/new/project"
 * }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json()
    const { targetProjectPath } = body as { targetProjectPath?: string }

    if (!targetProjectPath) {
      return NextResponse.json(
        { error: 'targetProjectPath is required' },
        { status: 400 }
      )
    }

    // 경로 유효성 확인
    if (!fs.existsSync(targetProjectPath)) {
      return NextResponse.json(
        { error: `Target path does not exist: ${targetProjectPath}` },
        { status: 400 }
      )
    }

    // 경로 설정
    setTargetProjectPath(targetProjectPath)

    // 새 경로로 GET 응답 반환
    return GET()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
