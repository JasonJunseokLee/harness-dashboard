import * as fs from 'fs'
import * as path from 'path'

// ─── 타입 정의 ─────────────────────────────────────────────────
export type VersionSource = 'initial' | 'user_refinement' | 'user_edit' | 'restore'

export interface VersionEntry {
  v: string           // "v1", "v2", ...
  timestamp: string   // ISO 8601
  source: VersionSource
  size: number        // 바이트 수
  lines: number       // 줄 수
  instruction: string | null  // 사용자 지시사항 (있을 경우)
}

export interface VersionMetadata {
  phase: string
  current: string     // 현재 활성 버전 ("v3")
  versions: VersionEntry[]
}

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  content: string
  lineNumber?: number
}

export interface DiffResult {
  v1: string
  v2: string
  hunks: DiffLine[]
  stats: { added: number; removed: number; unchanged: number }
}

// ─── AIVersionManager ──────────────────────────────────────────
// 파일시스템 기반 버전 관리 클래스
// .harness/ai-results/{phaseId}/ 디렉토리에 버전 파일과 메타데이터를 저장
export class AIVersionManager {
  private dir: string
  private metadataPath: string
  private phaseId: string

  constructor(phaseDir: string) {
    // phaseDir 예: ".harness/ai-results/claude-md"
    this.dir = path.resolve(process.cwd(), phaseDir)
    this.metadataPath = path.join(this.dir, 'metadata.json')
    this.phaseId = path.basename(phaseDir)
  }

  // ── 디렉토리 및 메타데이터 초기화 ──────────────────────────
  private ensureDir(): void {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true })
    }
  }

  private readMetadata(): VersionMetadata {
    if (fs.existsSync(this.metadataPath)) {
      return JSON.parse(fs.readFileSync(this.metadataPath, 'utf-8'))
    }
    return { phase: this.phaseId, current: '', versions: [] }
  }

  // 원자적 메타데이터 쓰기 (임시 파일 → rename)
  private writeMetadata(meta: VersionMetadata): void {
    const tmp = this.metadataPath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(meta, null, 2), 'utf-8')
    fs.renameSync(tmp, this.metadataPath)
  }

  // 다음 버전 번호 계산
  private nextVersion(meta: VersionMetadata): string {
    if (meta.versions.length === 0) return 'v1'
    const nums = meta.versions.map(v => parseInt(v.v.slice(1), 10))
    return `v${Math.max(...nums) + 1}`
  }

  // 버전 파일 경로
  private versionFilePath(version: string): string {
    return path.join(this.dir, `${this.phaseId}-${version}.md`)
  }

  // latest 파일 경로
  private latestFilePath(): string {
    return path.join(this.dir, `${this.phaseId}-latest.md`)
  }

  // ── 버전 저장 ──────────────────────────────────────────────
  async saveVersion(
    content: string,
    source: VersionSource,
    instruction?: string
  ): Promise<{ version: string; timestamp: string }> {
    this.ensureDir()
    const meta = this.readMetadata()
    const version = this.nextVersion(meta)
    const timestamp = new Date().toISOString()

    // 버전 파일 저장
    const versionFile = this.versionFilePath(version)
    fs.writeFileSync(versionFile, content, 'utf-8')

    // latest 파일 업데이트
    const latestFile = this.latestFilePath()
    fs.writeFileSync(latestFile, content, 'utf-8')

    // 메타데이터 업데이트
    const entry: VersionEntry = {
      v: version,
      timestamp,
      source,
      size: Buffer.byteLength(content, 'utf-8'),
      lines: content.split('\n').length,
      instruction: instruction?.trim() || null,
    }
    meta.versions.push(entry)
    meta.current = version
    this.writeMetadata(meta)

    return { version, timestamp }
  }

  // ── 현재 버전 조회 ─────────────────────────────────────────
  async getCurrentVersion(): Promise<{
    content: string
    version: string
    metadata: VersionEntry
  } | null> {
    const meta = this.readMetadata()
    if (!meta.current || meta.versions.length === 0) return null

    const entry = meta.versions.find(v => v.v === meta.current)
    if (!entry) return null

    const filePath = this.versionFilePath(meta.current)
    if (!fs.existsSync(filePath)) return null

    const content = fs.readFileSync(filePath, 'utf-8')
    return { content, version: meta.current, metadata: entry }
  }

  // ── 모든 버전 목록 ─────────────────────────────────────────
  async listVersions(): Promise<{
    current: string
    list: (VersionEntry & { preview: string })[]
  }> {
    const meta = this.readMetadata()
    const list = meta.versions.map(entry => {
      let preview = ''
      const filePath = this.versionFilePath(entry.v)
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8')
        preview = content.substring(0, 200)
      }
      return { ...entry, preview }
    })
    // 최신 버전이 위로 오도록 역순 정렬
    list.reverse()
    return { current: meta.current, list }
  }

  // ── 특정 버전 조회 ─────────────────────────────────────────
  async getVersion(version: string): Promise<{
    content: string
    metadata: VersionEntry
  }> {
    const meta = this.readMetadata()
    const entry = meta.versions.find(v => v.v === version)
    if (!entry) throw new Error(`버전 ${version}을 찾을 수 없습니다.`)

    const filePath = this.versionFilePath(version)
    if (!fs.existsSync(filePath)) {
      throw new Error(`버전 파일이 존재하지 않습니다: ${filePath}`)
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    return { content, metadata: entry }
  }

  // ── 버전 복원 (복원 행위 자체도 새 버전으로 기록) ──────────
  async restoreVersion(version: string): Promise<{ newVersion: string }> {
    const { content } = await this.getVersion(version)
    const { version: newVersion } = await this.saveVersion(
      content,
      'restore',
      `${version}에서 복원`
    )
    return { newVersion }
  }

  // ── 두 버전 비교 (간단한 줄 단위 diff) ─────────────────────
  async diffVersions(v1: string, v2: string): Promise<DiffResult> {
    const data1 = await this.getVersion(v1)
    const data2 = await this.getVersion(v2)

    const lines1 = data1.content.split('\n')
    const lines2 = data2.content.split('\n')

    // 간단한 LCS 기반 diff
    const hunks = this.computeDiff(lines1, lines2)
    const stats = {
      added: hunks.filter(h => h.type === 'added').length,
      removed: hunks.filter(h => h.type === 'removed').length,
      unchanged: hunks.filter(h => h.type === 'unchanged').length,
    }

    return { v1, v2, hunks, stats }
  }

  // ── 간단한 줄 단위 diff 알고리즘 ──────────────────────────
  private computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
    const result: DiffLine[] = []
    const maxLen = Math.max(oldLines.length, newLines.length)

    // LCS 대신 간단한 순차 비교 (성능 우선)
    // 짧은 문서에 적합한 O(n) 방식
    let oi = 0
    let ni = 0

    while (oi < oldLines.length || ni < newLines.length) {
      if (oi >= oldLines.length) {
        // old 소진 → 나머지는 added
        result.push({ type: 'added', content: newLines[ni], lineNumber: ni + 1 })
        ni++
      } else if (ni >= newLines.length) {
        // new 소진 → 나머지는 removed
        result.push({ type: 'removed', content: oldLines[oi], lineNumber: oi + 1 })
        oi++
      } else if (oldLines[oi] === newLines[ni]) {
        result.push({ type: 'unchanged', content: oldLines[oi], lineNumber: ni + 1 })
        oi++
        ni++
      } else {
        // 앞쪽에서 매칭되는 줄을 찾아본다 (lookahead 최대 5줄)
        let foundInNew = -1
        let foundInOld = -1
        const lookahead = Math.min(5, maxLen - Math.max(oi, ni))

        for (let k = 1; k <= lookahead; k++) {
          if (ni + k < newLines.length && oldLines[oi] === newLines[ni + k]) {
            foundInNew = ni + k
            break
          }
          if (oi + k < oldLines.length && oldLines[oi + k] === newLines[ni]) {
            foundInOld = oi + k
            break
          }
        }

        if (foundInNew > 0) {
          // new에서 매칭 발견 → 그 사이는 added
          for (let k = ni; k < foundInNew; k++) {
            result.push({ type: 'added', content: newLines[k], lineNumber: k + 1 })
          }
          ni = foundInNew
        } else if (foundInOld > 0) {
          // old에서 매칭 발견 → 그 사이는 removed
          for (let k = oi; k < foundInOld; k++) {
            result.push({ type: 'removed', content: oldLines[k], lineNumber: k + 1 })
          }
          oi = foundInOld
        } else {
          // 매칭 없음 → removed + added
          result.push({ type: 'removed', content: oldLines[oi], lineNumber: oi + 1 })
          result.push({ type: 'added', content: newLines[ni], lineNumber: ni + 1 })
          oi++
          ni++
        }
      }
    }

    return result
  }
}
