import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { getHarnessDir } from '@/app/lib/project-path'

export const runtime = 'nodejs'

function loadJson(file: string) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch { return null }
}

// 기술 스택에서 스타일링 도구 추출
function getStylingTools(ts: Record<string, string[] | string> | undefined): string {
  if (!ts || !Array.isArray(ts.styling) || !ts.styling.length) return 'Tailwind CSS'
  return ts.styling.join(', ')
}

function getFrontend(ts: Record<string, string[] | string> | undefined): string {
  if (!ts || !Array.isArray(ts.frontend) || !ts.frontend.length) return 'React/Next.js'
  return ts.frontend.join(', ')
}

// ─── GET: 저장된 design-guide.md 반환 ────────────────────────
export async function GET() {
  const HARNESS = getHarnessDir()
  const CACHE_FILE = path.join(HARNESS, 'design-system', 'design-guide.md')
  if (fs.existsSync(CACHE_FILE)) {
    const content = fs.readFileSync(CACHE_FILE, 'utf-8')
    return NextResponse.json({ exists: true, content })
  }
  return NextResponse.json({ exists: false, content: '' })
}

// ─── POST: claude -p 로 design-guide.md 생성 (SSE 스트리밍) ──
export async function POST(req: NextRequest) {
  const HARNESS = getHarnessDir()
  const body = await req.json().catch(() => ({}))
  const instruction: string = body.instruction ?? ''
  const project = loadJson(path.join(HARNESS, 'project.json'))
  const prd = loadJson(path.join(HARNESS, 'prd.json'))
  const features = loadJson(path.join(HARNESS, 'features.json'))

  if (!project) {
    return new Response(JSON.stringify({ error: '온보딩을 먼저 완료해주세요.' }), { status: 400 })
  }

  const styling = getStylingTools(project.techStack)
  const frontend = getFrontend(project.techStack)

  // 프로젝트 컨셉 추출
  const oneLiner = (prd?.overview as Record<string, string> | undefined)?.oneLiner ?? project.description
  const targetUsers = (prd?.target as Record<string, string> | undefined)?.users ?? '일반 사용자'

  // 주요 기능 카테고리
  const nodes = (features?.treeNodes as Array<{ type: string; label: string }> | undefined) ?? []
  const categories = nodes.filter(n => n.type === 'category').map(n => n.label).slice(0, 6)
  const categoryText = categories.length ? categories.join(', ') : '(기능 명세 없음)'

  const instructionSection = instruction.trim()
    ? `\n[사용자 추가 지시사항 — 최우선으로 반영하세요]\n${instruction.trim()}\n`
    : ''

  const prompt = `[중요] 파일 읽기, 파일 쓰기, 터미널 실행 등 어떤 도구도 사용하지 마세요. 오직 마크다운 텍스트만 stdout으로 출력하세요.

당신은 Vercel Geist, Stripe, Linear, shadcn/ui를 분석한 시니어 디자인 시스템 엔지니어입니다.${instructionSection}

━━━ 프로젝트 정보 ━━━
프로젝트: ${oneLiner}
타겟 사용자: ${targetUsers}
프론트엔드: ${frontend}
스타일링: ${styling}
주요 기능 영역: ${categoryText}
━━━━━━━━━━━━━━━━━━━

[필수 지시사항 — 이것을 가장 중요하게 따르세요]
아래 섹션 구조를 따라 design-guide.md 전체를 완성된 상태로 작성하세요.

반드시 지켜야 할 규칙:
1. 빈 칸, 플레이스홀더(; 만 있는 CSS), TODO, "여기에 X를 넣으세요" 같은 미완성 표현 절대 금지
2. CSS 변수는 실제 hex 값으로 모두 채울 것 (예: --bg-base: #0a0a0a;)
3. 코드 스니펫은 실제 클래스명과 값을 사용해 복사-붙여넣기 가능한 수준으로 작성
4. 각 섹션을 생략하거나 요약하지 말고 완전하게 작성
5. ${styling} 기반의 실제 클래스명 사용 (추상적 토큰 이름만 나열 금지)
6. "자세한 내용은 팀 논의 필요" 같은 회피 표현 금지

작성 원칙:
- "깔끔하게", "일관되게" 같은 모호한 서술 금지
- 모든 항목에 실제 코드 스니펫 또는 구체적 값 필수
- ${styling}에 맞는 실제 클래스명/CSS변수 사용
- 에이전트가 판단 없이 복사-붙여넣기할 수 있는 수준

---

# design-guide.md — ${oneLiner}

## 0. 이 파일의 사용법
이 파일은 AI 코딩 에이전트(Claude Code)가 UI를 생성할 때 참조하는 단일 소스입니다.
새 컴포넌트를 만들거나 기존 UI를 수정할 때 반드시 이 가이드를 따르세요.
가이드에 없는 패턴은 임의로 만들지 말고 섹션 12를 참조해 예외를 등록하세요.

---

## 1. 색상 시스템 (Token-First)

### 1-1. CSS 변수 정의 (globals.css 또는 tailwind.config.js)
프로젝트 특성에 맞는 실제 색상 값으로 아래 CSS 변수 블록을 작성하세요.
라이트/다크 양쪽 모두 작성하고, 각 변수의 용도를 주석으로 명시합니다.

\`\`\`css
:root {
  /* ── Background ── */
  --bg-base: ;        /* 최상위 배경 */
  --bg-subtle: ;      /* 카드/패널 배경 */
  --bg-muted: ;       /* 비활성/보조 배경 */
  --bg-inverse: ;     /* 반전 배경 (예: 다크 테마의 흰 요소) */

  /* ── Foreground (텍스트/아이콘) ── */
  --fg-base: ;        /* 기본 텍스트 */
  --fg-muted: ;       /* 보조 텍스트, placeholder */
  --fg-subtle: ;      /* 비활성 텍스트 */
  --fg-on-accent: ;   /* accent 배경 위 텍스트 (항상 흰색 또는 검정) */

  /* ── Border ── */
  --border-base: ;    /* 기본 보더 */
  --border-strong: ;  /* 강조 보더 (포커스, 에러) */
  --border-subtle: ;  /* 점선, 비활성 보더 */

  /* ── Accent (브랜드 컬러 — 1개 원칙) ── */
  --accent: ;         /* 주 브랜드 색 */
  --accent-hover: ;   /* 호버 시 약간 어두운 버전 */
  --accent-subtle: ;  /* 배경에 쓰는 흐린 버전 (10~15% opacity) */

  /* ── Semantic ── */
  --success: ;
  --success-subtle: ;
  --warning: ;
  --warning-subtle: ;
  --error: ;
  --error-subtle: ;
  --info: ;
  --info-subtle: ;
}

.dark {
  /* 다크 모드: 위 변수를 모두 오버라이드 */
}
\`\`\`

### 1-2. 색상 사용 규칙
| 용도 | 사용할 토큰 | 절대 사용 금지 |
|------|-----------|--------------|
| 페이지 배경 | --bg-base | 하드코딩 hex |
| 카드/패널 | --bg-subtle | bg-white, bg-gray-* |
| 기본 텍스트 | --fg-base | text-black, text-gray-900 |
| 보조 텍스트 | --fg-muted | text-gray-500 (직접) |
| 버튼 primary | --accent (bg), --fg-on-accent (text) | 임의 색상 |
| 에러 상태 | --error (text/border), --error-subtle (bg) | text-red-500 |
| 성공 상태 | --success, --success-subtle | text-green-500 |

### 1-3. 다크 모드 전략
- CSS 변수 오버라이드 방식 사용 (조건부 클래스 방식 금지)
- ❌ \`className={isDark ? 'bg-gray-900' : 'bg-white'}\`
- ✅ \`className="bg-[var(--bg-base)]"\` 또는 토큰 매핑 Tailwind 클래스

---

## 2. 타이포그래피

### 2-1. 폰트 스택
프로젝트에 맞는 웹폰트를 명시하세요. (예: Pretendard, Geist, Inter, Noto Sans KR 등)

\`\`\`css
--font-sans: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
\`\`\`

### 2-2. 사이즈 스케일 (변경 금지)
| 토큰 | px | rem | Tailwind | 용도 |
|------|----|-----|---------|------|
| text-2xs | 10px | 0.625rem | text-[10px] | 라벨, 배지 |
| text-xs | 12px | 0.75rem | text-xs | 캡션, 메타 |
| text-sm | 14px | 0.875rem | text-sm | 본문, 보조 텍스트 |
| text-base | 16px | 1rem | text-base | 기본 본문 |
| text-lg | 18px | 1.125rem | text-lg | 소제목 |
| text-xl | 20px | 1.25rem | text-xl | 섹션 제목 |
| text-2xl | 24px | 1.5rem | text-2xl | 페이지 제목 |
| text-3xl | 30px | 1.875rem | text-3xl | 히어로 제목 |

### 2-3. 용도별 Weight 규칙
| 상황 | font-weight | Tailwind |
|------|------------|---------|
| 기본 본문 | 400 | font-normal |
| UI 레이블, 버튼 | 500 | font-medium |
| 카드 제목, 소제목 | 600 | font-semibold |
| 페이지 제목, 히어로 | 700 | font-bold |
| 절대 사용 금지 | 300 이하 | — |

### 2-4. 줄간격 & 자간
\`\`\`
본문 텍스트: line-height: 1.6, letter-spacing: -0.01em
제목 텍스트: line-height: 1.25, letter-spacing: -0.03em
UI 레이블: line-height: 1.4, letter-spacing: 0
모노스페이스: line-height: 1.5, letter-spacing: 0
\`\`\`

---

## 3. 간격 & 레이아웃

### 3-1. Spacing 토큰 (4px 그리드 기반)
| 토큰 이름 | px | Tailwind | 주용도 |
|---------|-----|---------|-------|
| space-1 | 4px | p-1 / m-1 | 아이콘-텍스트 간격, 내부 미세 조정 |
| space-2 | 8px | p-2 / m-2 | 컴팩트 패딩, 인라인 요소 간격 |
| space-3 | 12px | p-3 / m-3 | 버튼 세로 패딩, 인풋 패딩 |
| space-4 | 16px | p-4 / m-4 | 카드 패딩 (소), 섹션 내부 여백 |
| space-5 | 20px | p-5 / m-5 | 카드 패딩 (기본) |
| space-6 | 24px | p-6 / m-6 | 섹션 패딩, 모달 패딩 |
| space-8 | 32px | p-8 / m-8 | 페이지 섹션 간격 |
| space-10 | 40px | p-10 / m-10 | 페이지 상단 여백 |
| space-12 | 48px | p-12 / m-12 | 히어로 섹션 |
| space-16 | 64px | p-16 / m-16 | 랜딩 섹션 간격 |

**4px 그리드 외 임의 값 사용 금지 (예: p-[13px] ❌)**

### 3-2. 레이아웃 구조
프로젝트 타입에 맞는 실제 레이아웃 ASCII 다이어그램:

\`\`\`
[사이드바 앱 예시]
┌─────────────────────────────────────────┐
│  Sidebar (w-56~64, h-screen, sticky)    │
│  ┌──────────────────────────────────┐   │
│  │  Logo (px-5 py-4)               │   │
│  │  Nav items (px-3 py-4)          │   │
│  │  Footer (px-5 py-4 mt-auto)     │   │
│  └──────────────────────────────────┘   │
├─────────────────────────────────────────┤
│  Main Content                           │
│  ┌──────────────────────────────────┐   │
│  │  Page (py-10 px-4 md:px-8)      │   │
│  │  ┌──────────────────────────┐   │   │
│  │  │  max-w-4xl mx-auto       │   │   │
│  │  │  Header (mb-8)           │   │   │
│  │  │  Content                 │   │   │
│  │  └──────────────────────────┘   │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
\`\`\`

### 3-3. 패딩 소유자 규칙 (이중 패딩 방지)
| 영역 | 패딩 소유자 | 패딩 값 |
|------|-----------|--------|
| 페이지 외부 여백 | page 컴포넌트 (py-10 px-4) | — |
| 콘텐츠 최대 폭 | max-w-* mx-auto 래퍼 | — |
| 카드 내부 | Card 컴포넌트 (p-5 또는 p-6) | 자식이 추가 패딩 금지 |
| 모달/다이얼로그 | Dialog 루트 (p-6) | — |
| 테이블 셀 | td/th (px-4 py-3) | — |
| 버튼 | Button 컴포넌트 (px-4 py-2) | — |

### 3-4. 반응형 브레이크포인트
| 이름 | 값 | 적용 범위 |
|------|----|---------|
| sm | 640px | 모바일 → 소형 태블릿 전환 |
| md | 768px | 1열 → 2열 그리드 전환 |
| lg | 1024px | 사이드바 표시, 3열 그리드 |
| xl | 1280px | 최대 콘텐츠 폭 도달 |

---

## 4. 컴포넌트 패턴 (실제 코드)

### 4-1. Button
\`\`\`tsx
// variant와 size를 cva로 관리 (shadcn/ui 스타일)
// Tailwind 기반 예시 — 실제 토큰 변수로 교체할 것

// Primary
<button className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--fg-on-accent)] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
  버튼 텍스트
</button>

// Secondary (outline)
<button className="px-4 py-2 border border-[var(--border-base)] hover:border-[var(--border-strong)] text-[var(--fg-base)] rounded-lg text-sm font-medium transition-colors bg-transparent">
  버튼 텍스트
</button>

// Destructive
<button className="px-4 py-2 bg-[var(--error)] hover:opacity-90 text-white rounded-lg text-sm font-medium transition-colors">
  삭제
</button>

// Ghost
<button className="px-4 py-2 text-[var(--fg-muted)] hover:text-[var(--fg-base)] hover:bg-[var(--bg-subtle)] rounded-lg text-sm font-medium transition-colors">
  버튼
</button>
\`\`\`

**버튼 크기 규칙**
| 크기 | 패딩 | 텍스트 | 용도 |
|------|------|-------|------|
| sm | px-3 py-1.5 | text-xs | 테이블 내 액션, 배지형 |
| md (기본) | px-4 py-2 | text-sm | 일반 액션 버튼 |
| lg | px-5 py-3 | text-base | CTA, 중요 액션 |

### 4-2. Input / Form
\`\`\`tsx
// 기본 Input
<input
  className="w-full px-4 py-2.5 bg-[var(--bg-subtle)] border border-[var(--border-base)] rounded-lg text-sm text-[var(--fg-base)] placeholder:text-[var(--fg-subtle)] focus:outline-none focus:border-[var(--border-strong)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
/>

// 에러 상태
<input className="... border-[var(--error)] focus:ring-[var(--error)]" />
<p className="mt-1.5 text-xs text-[var(--error)]">에러 메시지</p>

// 비활성 상태
<input disabled className="... opacity-50 cursor-not-allowed" />
\`\`\`

**폼 레이아웃 규칙**
\`\`\`tsx
// 레이블 + 인풋 + 에러 세트 — 항상 이 구조 유지
<div className="space-y-1.5">
  <label className="text-sm font-medium text-[var(--fg-base)]">레이블</label>
  <input ... />
  {error && <p className="text-xs text-[var(--error)]">{error}</p>}
  {hint && <p className="text-xs text-[var(--fg-muted)]">{hint}</p>}
</div>
\`\`\`

### 4-3. Card / Panel
\`\`\`tsx
// 기본 카드
<div className="bg-[var(--bg-subtle)] rounded-xl border border-[var(--border-base)] p-5">
  {/* 카드 내부에 추가 패딩 금지 */}
</div>

// 구분선이 있는 카드 (헤더+바디)
<div className="bg-[var(--bg-subtle)] rounded-xl border border-[var(--border-base)] overflow-hidden">
  <div className="px-5 py-4 border-b border-[var(--border-base)]">
    <h3 className="text-sm font-semibold text-[var(--fg-base)]">카드 제목</h3>
  </div>
  <div className="p-5">
    {/* 바디 */}
  </div>
</div>
\`\`\`

### 4-4. Badge / Tag
\`\`\`tsx
// 상태 배지
const badgeVariants = {
  default:  "bg-[var(--bg-muted)] text-[var(--fg-muted)] border border-[var(--border-base)]",
  success:  "bg-[var(--success-subtle)] text-[var(--success)] border border-[var(--success)]",
  warning:  "bg-[var(--warning-subtle)] text-[var(--warning)] border border-[var(--warning)]",
  error:    "bg-[var(--error-subtle)] text-[var(--error)] border border-[var(--error)]",
  accent:   "bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]",
}

<span className={\`px-2.5 py-0.5 rounded-full text-xs font-medium \${badgeVariants.success}\`}>
  완료
</span>
\`\`\`

### 4-5. Table
\`\`\`tsx
<div className="border border-[var(--border-base)] rounded-xl overflow-hidden">
  <table className="w-full text-sm">
    <thead className="bg-[var(--bg-muted)]">
      <tr>
        <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider">
          컬럼명
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-[var(--border-base)]">
      <tr className="hover:bg-[var(--bg-subtle)] transition-colors">
        <td className="px-4 py-3 text-[var(--fg-base)]">데이터</td>
      </tr>
    </tbody>
  </table>
</div>
\`\`\`

### 4-6. Empty State (빈 상태)
\`\`\`tsx
// 모든 목록/테이블 페이지에 반드시 구현
<div className="flex flex-col items-center justify-center py-20 text-[var(--fg-subtle)]">
  <div className="text-4xl mb-3">{icon}</div>   {/* 이모지 또는 SVG 아이콘 */}
  <p className="text-sm font-medium text-[var(--fg-muted)]">{title}</p>
  <p className="text-xs mt-1">{description}</p>
  {actionLabel && (
    <button className="mt-4 ...primary button...">{actionLabel}</button>
  )}
</div>
\`\`\`

---

## 5. 상태 처리 패턴

### 5-1. 로딩 상태 선택 기준
| 상황 | 방식 | 구현 |
|------|------|------|
| 첫 페이지 로드 (데이터 없음) | 스켈레톤 | 실제 레이아웃과 동일한 빈 버전 |
| 버튼 클릭 후 액션 | 버튼 내 스피너 + disabled | \`<Loader2 className="animate-spin" />\` |
| 전체 화면 블로킹 작업 | 오버레이 스피너 | 드물게만 사용 |
| 데이터 리페치 (기존 데이터 있음) | 기존 UI 유지 + 상단 진행바 | 스켈레톤으로 교체 금지 |

**스켈레톤 규칙**: loading.tsx는 page.tsx의 레이아웃을 정확히 미러링해야 함
\`\`\`tsx
// page.tsx 구조:  <Card> → <Title> + <Body>
// loading.tsx:    <Card> → <div className="h-5 w-32 bg-[var(--bg-muted)] rounded animate-pulse" />
//                          <div className="h-20 bg-[var(--bg-muted)] rounded animate-pulse mt-3" />
\`\`\`

### 5-2. 에러 상태
\`\`\`tsx
// 인라인 에러 (폼 필드)
<p className="text-xs text-[var(--error)] mt-1">{message}</p>

// 섹션 에러 (카드 내)
<div className="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 text-sm text-[var(--error)]">
  {message}
</div>

// 페이지 레벨 에러
<div className="flex flex-col items-center py-20">
  <p className="text-[var(--error)] font-medium">오류가 발생했습니다</p>
  <p className="text-sm text-[var(--fg-muted)] mt-1">{message}</p>
  <button onClick={retry} className="mt-4 ...secondary button...">다시 시도</button>
</div>
\`\`\`

### 5-3. Toast / 알림
| 타입 | 사용 시점 | 색상 |
|------|---------|------|
| success | 저장/생성/삭제 성공 | --success |
| error | 네트워크 오류, 권한 오류 | --error |
| warning | 되돌릴 수 없는 작업 전 경고 | --warning |
| info | 중립적 안내 메시지 | --info |

**규칙**: Toast는 3초 자동 사라짐. 중요 에러는 사용자가 닫을 때까지 유지.

---

## 6. 아이콘 시스템
- **단일 소스**: lucide-react (또는 프로젝트에서 채택한 라이브러리) 사용
- 다른 아이콘 라이브러리 혼용 금지
- 기본 크기: w-4 h-4 (16px) — UI 아이콘
- 강조 크기: w-5 h-5 (20px) — 버튼 내, 사이드바
- 빈 상태/히어로: w-8 h-8 이상 허용
- 색상: 부모 텍스트 색 상속 (currentColor)

---

## 7. 모션 & 트랜지션
\`\`\`
기본 전환: transition-colors duration-150 ease-in-out
레이아웃 전환: transition-all duration-200 ease-in-out
페이드인: animate-in fade-in duration-200 (tailwindcss-animate)
스케일: animate-in zoom-in-95 duration-150

금지: transition-all을 항상 쓰는 것 (성능 이슈)
금지: duration-500 이상 (느려 보임)
\`\`\`

---

## 8. z-index 계층
| 레이어 | 값 | 요소 |
|--------|----|----|
| base | 0 | 일반 콘텐츠 |
| raised | 10 | 드롭다운, 팝오버 |
| sticky | 20 | 스티키 헤더/사이드바 |
| overlay | 30 | 모달 배경(backdrop) |
| modal | 40 | 모달, 다이얼로그 |
| toast | 50 | Toast 알림 |
| tooltip | 60 | 툴팁 |

임의 z-index(z-[999] 등) 사용 금지.

---

## 9. 금지 패턴 카탈로그

### 9-1. 색상 하드코딩
\`\`\`tsx
// ❌
<div className="bg-gray-900 text-white border-gray-700">
// ✅
<div className="bg-[var(--bg-subtle)] text-[var(--fg-base)] border-[var(--border-base)]">
\`\`\`

### 9-2. 이중 패딩
\`\`\`tsx
// ❌ Card(p-5) 안에서 또 패딩
<div className="bg-[var(--bg-subtle)] p-5">
  <div className="p-4">  {/* 이중 패딩 */}
    <p>내용</p>
  </div>
</div>
// ✅
<div className="bg-[var(--bg-subtle)] p-5">
  <p>내용</p>  {/* 직접 */}
</div>
\`\`\`

### 9-3. 이중 헤더 (서버+클라이언트 동시 렌더)
\`\`\`tsx
// ❌ layout.tsx에도 <h1>, page.tsx에도 <h1>
// ✅ 헤더는 page.tsx 한 곳에서만 렌더링
\`\`\`

### 9-4. 임의 spacing
\`\`\`tsx
// ❌
<div className="mt-[13px] p-[7px]">
// ✅ 4px 그리드 값만
<div className="mt-3 p-2">
\`\`\`

### 9-5. 다크모드 조건부 클래스
\`\`\`tsx
// ❌
className={isDark ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}
// ✅ CSS 변수 사용
className="bg-[var(--bg-base)] text-[var(--fg-base)]"
\`\`\`

---

## 10. 페이지 레시피 (복사-붙여넣기 용)

### 10-1. 목록 페이지 (CRUD)
\`\`\`tsx
export default function ListPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-base)] text-[var(--fg-base)] py-10 px-4">
      <div className="max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">{페이지 제목}</h1>
            <p className="text-sm text-[var(--fg-muted)] mt-1">{부제목}</p>
          </div>
          <button className="...primary button...">{추가 액션}</button>
        </div>

        {/* 필터/검색 (있을 경우) */}
        <div className="flex gap-3 mb-6">
          <input placeholder="검색..." className="...input..." />
        </div>

        {/* 목록 */}
        {isLoading ? <ListSkeleton /> : items.length === 0 ? <EmptyState /> : (
          <div className="space-y-3">
            {items.map(item => <ItemCard key={item.id} item={item} />)}
          </div>
        )}
      </div>
    </main>
  )
}
\`\`\`

### 10-2. 상세/뷰어 페이지
\`\`\`tsx
export default function DetailPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-base)] py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* 뒤로가기 + 헤더 */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.back()} className="...ghost button...">← 목록</button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{제목}</h1>
          </div>
          <div className="flex gap-2">
            <button className="...secondary...">편집</button>
            <button className="...destructive...">삭제</button>
          </div>
        </div>

        {/* 섹션들 */}
        <div className="space-y-4">
          <div className="bg-[var(--bg-subtle)] rounded-xl border border-[var(--border-base)] p-6">
            <h3 className="text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-widest mb-3">섹션 제목</h3>
            <p className="text-sm text-[var(--fg-base)] leading-relaxed">{내용}</p>
          </div>
        </div>
      </div>
    </main>
  )
}
\`\`\`

### 10-3. 폼 페이지
\`\`\`tsx
export default function FormPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-base)] py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-8">{폼 제목}</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 필드 그룹 */}
          <div className="bg-[var(--bg-subtle)] rounded-xl border border-[var(--border-base)] p-6 space-y-5">
            <h3 className="text-sm font-semibold text-[var(--fg-muted)] uppercase tracking-widest">섹션명</h3>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">필드명 *</label>
              <input className="...input..." />
              {errors.field && <p className="text-xs text-[var(--error)]">{errors.field}</p>}
            </div>
          </div>

          {/* 액션 */}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onCancel} className="...secondary...">취소</button>
            <button type="submit" disabled={isSubmitting} className="...primary...">
              {isSubmitting ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
\`\`\`

---

## 11. 주요 기능별 특수 패턴

프로젝트의 주요 기능 영역(${categoryText})에 맞는 특수 UI 패턴을 아래에 추가로 작성하세요.
각 기능 영역에서 반복되는 UI 구조, 특수 인터랙션, 주의사항을 명시합니다.

---

## 12. 예외 처리 & 토큰 갭

| 예외 페이지/컴포넌트 | 이유 | 허용된 이탈 |
|-------------------|------|-----------|
| 404 / 에러 페이지 | 전체 레이아웃 없음 | 풀스크린 센터 레이아웃 허용 |
| (추가 예외 발견 시 여기에 등록) | | |

**토큰 갭**: CSS 변수에 없지만 현재 사용 중인 값은 아래에 기록하고, 추후 토큰으로 편입 예정
- (임시 허용 값 목록)

---
이 가이드는 ${frontend} + ${styling} 기술 스택을 기준으로 작성되었습니다.
실제 프로젝트 초기 세팅 시 섹션 1의 CSS 변수 값을 먼저 채운 뒤 개발을 시작하세요.`

  const DS_DIR = path.join(HARNESS, 'design-system')
  const CACHE_FILE = path.join(DS_DIR, 'design-guide.md')

  // 재생성 시 기존 캐시 삭제 (claude가 파일을 읽고 "이미 존재" 응답하는 것 방지)
  if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE)

  const enc = new TextEncoder()
  let fullContent = ''

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))

      // 긴 프롬프트는 ARG_MAX 한계를 피해 stdin으로 전달
      const proc = spawn('claude', ['--print'], {
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      proc.stdin?.write(prompt)
      proc.stdin?.end()

      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        fullContent += text
        try { send({ type: 'text', text }) } catch { /* closed */ }
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        const msg = chunk.toString().trim()
        if (msg) try { send({ type: 'text', text: `▸ ${msg}\n` }) } catch { /* closed */ }
      })

      proc.on('close', () => {
        // design-system 폴더에 저장
        if (!fs.existsSync(DS_DIR)) fs.mkdirSync(DS_DIR, { recursive: true })
        fs.writeFileSync(CACHE_FILE, fullContent, 'utf-8')

        // setup.json 업데이트
        const setupFile = path.join(HARNESS, 'setup.json')
        const existing = fs.existsSync(setupFile)
          ? JSON.parse(fs.readFileSync(setupFile, 'utf-8'))
          : {}
        fs.writeFileSync(setupFile, JSON.stringify({ ...existing, designSystem: true, updatedAt: new Date().toISOString() }, null, 2))

        try { send({ type: 'done' }) } catch { /* closed */ }
        try { controller.close() } catch { /* already closed */ }
      })

      proc.on('error', (err: Error) => {
        try { send({ type: 'text', text: `▸ 오류: ${err.message}\n` }) } catch { /* closed */ }
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}
