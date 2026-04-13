import * as fs from 'fs'
import * as path from 'path'

/**
 * 대상 프로젝트 경로를 결정하는 싱글톤
 * 우선순위: HARNESS_TARGET env → ~/.harness-launch.json → process.cwd()
 */

interface LaunchManifest {
  targetProjectPath: string
  invokedAt: string
  resumeStep?: string
}

class ProjectPathResolver {
  private _targetPath: string | null = null
  private _initialized = false

  /**
   * 대상 프로젝트의 절대 경로 반환
   * 여러 번 호출해도 같은 경로 반환 (캐시됨)
   */
  getTargetProjectPath(): string {
    if (!this._initialized) {
      this._resolvePath()
      this._initialized = true
    }
    return this._targetPath || process.cwd()
  }

  /**
   * 대상 프로젝트의 .harness 디렉토리 경로
   */
  getHarnessDir(): string {
    return path.join(this.getTargetProjectPath(), '.harness')
  }

  /**
   * harness-dashboard 앱 자체의 context 디렉토리
   * (컨텍스트 파일은 대시보드 로컬에 유지됨)
   */
  getContextDir(): string {
    return path.join(process.cwd(), 'context')
  }

  /**
   * 현재 세션의 대상 프로젝트 정보 반환
   */
  getSessionInfo(): {
    targetProjectPath: string
    harnessDir: string
    contextDir: string
    projectName: string
  } {
    const targetPath = this.getTargetProjectPath()
    return {
      targetProjectPath: targetPath,
      harnessDir: this.getHarnessDir(),
      contextDir: this.getContextDir(),
      projectName: path.basename(targetPath),
    }
  }

  /**
   * 현재 세션의 대상 경로를 새로운 경로로 전환
   * (실행 중인 대시보드에서 프로젝트 경로를 변경할 때 사용)
   */
  setTargetProjectPath(newPath: string): void {
    // 경로 유효성 확인
    if (!fs.existsSync(newPath)) {
      throw new Error(`Target project path does not exist: ${newPath}`)
    }
    this._targetPath = path.resolve(newPath)
  }

  /**
   * 내부: 경로 결정 로직
   */
  private _resolvePath(): void {
    // 1. 환경변수 HARNESS_TARGET 확인
    if (process.env.HARNESS_TARGET) {
      this._targetPath = path.resolve(process.env.HARNESS_TARGET)
      return
    }

    // 2. ~/.harness-launch.json 확인
    const launchJsonPath = path.join(process.env.HOME || '~', '.harness-launch.json')
    try {
      if (fs.existsSync(launchJsonPath)) {
        const manifest: LaunchManifest = JSON.parse(fs.readFileSync(launchJsonPath, 'utf-8'))
        if (manifest.targetProjectPath && fs.existsSync(manifest.targetProjectPath)) {
          this._targetPath = path.resolve(manifest.targetProjectPath)
          return
        }
      }
    } catch (err) {
      // 파일 읽기 실패 → fallback
    }

    // 3. Fallback: process.cwd() (harness-dashboard 자체)
    this._targetPath = process.cwd()
  }
}

// 싱글톤 인스턴스
const resolver = new ProjectPathResolver()

export function getTargetProjectPath(): string {
  return resolver.getTargetProjectPath()
}

export function getHarnessDir(): string {
  return resolver.getHarnessDir()
}

export function getContextDir(): string {
  return resolver.getContextDir()
}

export function getSessionInfo() {
  return resolver.getSessionInfo()
}

export function setTargetProjectPath(newPath: string): void {
  resolver.setTargetProjectPath(newPath)
}
