import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

export const runtime = 'nodejs'

const CONTEXT_DIR = path.join(process.cwd(), 'context')

// context 폴더 파일 목록 반환
export async function GET() {
  if (!fs.existsSync(CONTEXT_DIR)) {
    return NextResponse.json({ files: [], path: CONTEXT_DIR })
  }

  const files = fs.readdirSync(CONTEXT_DIR)
    .filter(f => !f.startsWith('.'))
    .map(f => {
      const stat = fs.statSync(path.join(CONTEXT_DIR, f))
      return {
        name: f,
        size: stat.size,
        // KB 단위로 표시
        sizeLabel: stat.size < 1024
          ? `${stat.size}B`
          : `${(stat.size / 1024).toFixed(1)}KB`,
      }
    })

  return NextResponse.json({ files, path: CONTEXT_DIR })
}

// context 폴더에 파일 업로드 (multipart/form-data)
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })
  }

  // 텍스트 파일만 허용 (PDF는 바이너리라 분석 불가)
  const allowed = ['.txt', '.md', '.json', '.csv']
  const ext = path.extname(file.name).toLowerCase()
  if (!allowed.includes(ext)) {
    return NextResponse.json(
      { error: `텍스트 파일만 업로드 가능합니다 (${allowed.join(', ')}). PDF는 텍스트로 변환 후 .txt로 저장해주세요.` },
      { status: 400 }
    )
  }

  if (!fs.existsSync(CONTEXT_DIR)) fs.mkdirSync(CONTEXT_DIR, { recursive: true })

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  fs.writeFileSync(path.join(CONTEXT_DIR, file.name), buffer)

  return NextResponse.json({ success: true, name: file.name })
}
