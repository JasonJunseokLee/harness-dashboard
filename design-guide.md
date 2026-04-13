# design-guide.md — 쇼핑몰 데이터 수집 크롬 익스텐션 대시보드

## 0. 이 파일의 사용법

이 파일은 AI 코딩 에이전트(Claude Code)가 UI를 생성할 때 참조하는 **단일 소스**입니다.
새 컴포넌트를 만들거나 기존 UI를 수정할 때 반드시 이 가이드를 따르세요.
가이드에 없는 패턴은 임의로 만들지 말고 섹션 12를 참조해 예외를 등록하세요.

**기술 스택**: Next.js (App Router) + React + Tailwind CSS + Geist 폰트  
**테마 기조**: Dark-first (zinc-950 배경) — B2B SaaS 운영 도구, 크롬 익스텐션 관리 대시보드  
**주 사용 환경**: 데스크탑 Chrome, 1280px 이상 해상도

---

## 1. 색상 시스템 (Token-First)

### 1-1. CSS 변수 정의 (`app/globals.css`)

```css
:root {
  /* ── Background ── */
  --bg-base:    #09090b; /* zinc-950 — 최상위 페이지 배경 */
  --bg-subtle:  #18181b; /* zinc-900 — 카드, 사이드바, 패널 배경 */
  --bg-muted:   #27272a; /* zinc-800 — 인풋, 테이블 헤더, 비활성 배경 */
  --bg-overlay: #3f3f46; /* zinc-700 — 호버, 드롭다운, 팝오버 배경 */
  --bg-inverse: #f4f4f5; /* zinc-100 — 반전 배경 (거의 미사용, 라이트 강조 요소) */

  /* ── Foreground (텍스트/아이콘) ── */
  --fg-base:       #f4f4f5; /* zinc-100 — 기본 텍스트 */
  --fg-muted:      #a1a1aa; /* zinc-400 — 보조 텍스트, placeholder */
  --fg-subtle:     #71717a; /* zinc-500 — 비활성 텍스트, 힌트 */
  --fg-disabled:   #3f3f46; /* zinc-700 — 완전 비활성 */
  --fg-on-accent:  #ffffff; /* accent 배경 위 텍스트 — 항상 흰색 */

  /* ── Border ── */
  --border-base:   #27272a; /* zinc-800 — 기본 보더 */
  --border-strong: #52525b; /* zinc-600 — 강조 보더 (포커스, 에러) */
  --border-subtle: #18181b; /* zinc-900 — 점선, 구분선 */

  /* ── Accent (브랜드 컬러 — 1개 원칙) ── */
  --accent:        #2563eb; /* blue-600 — 주 브랜드 색 */
  --accent-hover:  #3b82f6; /* blue-500 — 호버 시 */
  --accent-subtle: #0a1628; /* blue-950 — 배경에 쓰는 흐린 버전 */

  /* ── Semantic ── */
  --success:        #22c55e; /* green-500 */
  --success-subtle: #052e16; /* green-950 */
  --success-text:   #86efac; /* green-300 */

  --warning:        #f59e0b; /* amber-500 */
  --warning-subtle: #1c1003; /* amber-950 */
  --warning-text:   #fcd34d; /* amber-300 */

  --error:          #ef4444; /* red-500 */
  --error-subtle:   #1c0a0a; /* red-950 */
  --error-text:     #fca5a5; /* red-300 */

  --info:           #3b82f6; /* blue-500 */
  --info-subtle:    #0a1628; /* blue-950 */
  --info-text:      #93c5fd; /* blue-300 */
}

/* 이 프로젝트는 Dark-first 단일 테마입니다.
   .dark 클래스 토글 방식을 사용하지 않습니다.
   라이트 모드 지원이 필요해지면 섹션 12에 예외 등록 후 작업하세요. */
```

### 1-2. 색상 사용 규칙

| 용도 | 사용할 토큰 (Tailwind 클래스) | 절대 사용 금지 |
|------|------------------------------|--------------|
| 페이지 배경 | `bg-[var(--bg-base)]` 또는 `bg-zinc-950` | `bg-white`, `bg-gray-*` |
| 카드/패널/사이드바 | `bg-[var(--bg-subtle)]` 또는 `bg-zinc-900` | `bg-white`, `bg-slate-*` |
| 인풋/테이블헤더 배경 | `bg-[var(--bg-muted)]` 또는 `bg-zinc-800` | `bg-gray-100` |
| 호버 배경 | `hover:bg-[var(--bg-overlay)]` 또는 `hover:bg-zinc-700` | `hover:bg-gray-*` |
| 기본 텍스트 | `text-[var(--fg-base)]` 또는 `text-zinc-100` | `text-black`, `text-gray-900` |
| 보조 텍스트 | `text-[var(--fg-muted)]` 또는 `text-zinc-400` | `text-gray-500` 직접 사용 |
| 힌트/비활성 텍스트 | `text-[var(--fg-subtle)]` 또는 `text-zinc-500` | `text-gray-400` |
| 기본 보더 | `border-[var(--border-base)]` 또는 `border-zinc-800` | `border-gray-200` |
| 강조 보더(포커스) | `border-[var(--border-strong)]` 또는 `border-zinc-600` | `border-blue-*` 직접 |
| 버튼 Primary | `bg-[var(--accent)]` + `text-[var(--fg-on-accent)]` | 임의 색상 |
| 에러 상태 | `text-[var(--error-text)]` (텍스트), `bg-[var(--error-subtle)]` (배경) | `text-red-500` 직접 |
| 성공 상태 | `text-[var(--success-text)]`, `bg-[var(--success-subtle)]` | `text-green-500` 직접 |

### 1-3. 다크 모드 전략

이 프로젝트는 **Dark-only** 단일 테마입니다. 조건부 클래스 방식 사용 금지.

```tsx
// ❌ 절대 금지
className={isDark ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}

// ✅ 항상 이 방식
className="bg-zinc-950 text-zinc-100"
// 또는 CSS 변수 방식
className="bg-[var(--bg-base)] text-[var(--fg-base)]"
```

---

## 2. 타이포그래피

### 2-1. 폰트 스택

`app/layout.tsx`에 이미 설정됨 — **변경 금지**

```tsx
// app/layout.tsx
import { Geist, Geist_Mono } from "next/font/google";
// font-sans → Geist Sans (모든 UI 텍스트)
// font-mono → Geist Mono (URL, ID, 코드값, JSON, 수집 데이터 필드값)
```

```css
/* CSS 변수 (참조용) */
--font-sans: var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: var(--font-geist-mono), 'JetBrains Mono', ui-monospace, monospace;
```

**적용 규칙**:
- 모든 UI 텍스트: 클래스 없음 (기본 `font-sans` 상속)
- URL, API 키, 상품 ID, JSON 값: `font-mono`
- 수집 데이터 결과 필드값: `font-mono text-zinc-300`

### 2-2. 사이즈 스케일 (변경 금지)

| 토큰 | px | rem | Tailwind | 용도 |
|------|----|-----|---------|------|
| text-2xs | 10px | 0.625rem | `text-[10px]` | 뱃지 내부, 상태 도트 레이블 |
| text-xs | 12px | 0.75rem | `text-xs` | 레이블, 캡션, 힌트, 테이블 컬럼 헤더 |
| text-sm | 14px | 0.875rem | `text-sm` | 본문, 테이블 셀, 버튼, 입력값 |
| text-base | 16px | 1rem | `text-base` | 기본 본문 (드물게 사용) |
| text-lg | 18px | 1.125rem | `text-lg` | 카드 제목, 섹션 소제목 |
| text-xl | 20px | 1.25rem | `text-xl` | 패널/모달 제목 |
| text-2xl | 24px | 1.5rem | `text-2xl` | 페이지 제목 |
| text-3xl | 30px | 1.875rem | `text-3xl` | 랜딩/온보딩 히어로 제목 |

### 2-3. 용도별 Weight 규칙

| 상황 | font-weight | Tailwind |
|------|------------|---------|
| 기본 본문, 테이블 셀 | 400 | `font-normal` |
| UI 레이블, 버튼, 입력값 | 500 | `font-medium` |
| 카드 제목, 소제목, 섹션명 | 600 | `font-semibold` |
| 페이지 제목, 히어로 | 700 | `font-bold` |
| 300 이하 | **절대 금지** | — |

### 2-4. 줄간격 & 자간

```
페이지/히어로 제목 (2xl+):  line-height: 1.25 (leading-tight),  letter-spacing: -0.03em (tracking-tight)
소제목 (lg~xl):              line-height: 1.375 (leading-snug),  letter-spacing: 기본
본문/테이블 셀:              line-height: 1.5 (leading-normal),  letter-spacing: 기본
코드/데이터/URL:             line-height: 1.625 (leading-relaxed), letter-spacing: 기본
레이블/뱃지/컬럼헤더:        line-height: 1 (leading-none),      letter-spacing: 0.05em (tracking-wide)
```

---

## 3. 간격 & 레이아웃

### 3-1. Spacing 토큰 (4px 그리드 기반)

| 토큰 이름 | px | Tailwind | 주용도 |
|---------|-----|---------|-------|
| space-1 | 4px | `p-1` / `m-1` / `gap-1` | 아이콘-텍스트 갭, 상태 도트 여백 |
| space-2 | 8px | `p-2` / `gap-2` | 버튼 아이콘 갭, 인라인 요소 간격 |
| space-3 | 12px | `p-3` / `gap-3` | 네비 아이템 패딩, 뱃지 패딩 세로 |
| space-4 | 16px | `p-4` / `gap-4` | 카드 패딩(소), 폼 필드 간격, 테이블 셀 |
| space-5 | 20px | `p-5` / `gap-5` | 사이드바 로고 패딩, 섹션 내 그룹 간격 |
| space-6 | 24px | `p-6` / `gap-6` | 카드/패널 패딩(기본), 모달 패딩 |
| space-8 | 32px | `p-8` / `gap-8` | 섹션 간 구분, 페이지 내 대단원 |
| space-10 | 40px | `p-10` / `gap-10` | 페이지 상단 여백 |
| space-12 | 48px | `p-12` | 히어로/온보딩 섹션 |
| space-16 | 64px | `p-16` | 최상위 레이아웃 (거의 미사용) |

**4px 그리드 외 임의 값 사용 금지** (예: `p-[13px]` ❌, `mt-[7px]` ❌)

### 3-2. 레이아웃 구조

```
┌──────────────────────────────────────────────────────────┐
│  Sidebar (w-56, h-screen, sticky top-0, bg-zinc-900)     │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Logo (px-5 py-5, border-b border-zinc-800)      │    │
│  │  Nav items (px-3 py-4, space-y-1)                │    │
│  │  Footer (px-5 py-4, border-t border-zinc-800,    │    │
│  │           mt-auto)                               │    │
│  └──────────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────────┤
│  Main Content (flex-1, overflow-y-auto)                  │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Page (py-8 px-6)                                │    │
│  │  ┌────────────────────────────────────────────┐  │    │
│  │  │  max-w-5xl mx-auto (넓은 테이블)           │  │    │
│  │  │  max-w-4xl mx-auto (기본 콘텐츠)           │  │    │
│  │  │  max-w-xl mx-auto  (폼 페이지)             │  │    │
│  │  │  ┌──────────────────────────────────────┐  │  │    │
│  │  │  │  Header (mb-8)                       │  │  │    │
│  │  │  │  Content                             │  │  │    │
│  │  │  └──────────────────────────────────────┘  │  │    │
│  │  └────────────────────────────────────────────┘  │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

```tsx
// 표준 대시보드 레이아웃 — app/(dashboard)/layout.tsx
<div className="flex min-h-screen bg-zinc-950">
  <Sidebar /> {/* w-56 shrink-0 */}
  <main className="flex-1 overflow-y-auto">{children}</main>
</div>

// 표준 페이지 래퍼 — 각 page.tsx 내부
<div className="py-8 px-6">
  <div className="max-w-5xl mx-auto">
    {/* 페이지 내용 */}
  </div>
</div>
```

### 3-3. 패딩 소유자 규칙 (이중 패딩 방지)

| 영역 | 패딩 소유자 | 패딩 값 |
|------|-----------|--------|
| 페이지 외부 여백 | page 컴포넌트 | `py-8 px-6` |
| 콘텐츠 최대 폭 | `max-w-* mx-auto` 래퍼 | 패딩 없음 |
| 카드 내부 | Card 컴포넌트 | `p-6` (자식이 추가 패딩 금지) |
| 카드 헤더/바디 분리형 | 헤더 `px-5 py-4`, 바디 `p-5` | — |
| 모달/다이얼로그 | Dialog 루트 | `p-6` |
| 테이블 셀 | `td` / `th` | `px-4 py-3` |
| 버튼 | Button 컴포넌트 | `px-4 py-2` |
| 사이드바 네비 아이템 | Link 컴포넌트 | `px-3 py-2.5` |

### 3-4. 반응형 브레이크포인트

| 이름 | 값 | 적용 범위 |
|------|----|---------|
| (모바일 기본) | 0px | 단일 컬럼 스택 (미최적화) |
| `md:` | 768px | 사이드바 표시, 2열 그리드 전환 |
| `lg:` | 1024px | 풀 레이아웃, 3열 그리드 |
| `xl:` | 1280px | 주 사용 환경 — 넓은 테이블, 추가 패널 |

> **주의**: 주 사용 환경은 데스크탑 Chrome 1280px+입니다. `md:` 미만은 축소 표시만 보장하며, 모바일 최적화는 범위 외입니다.

---

## 4. 컴포넌트 패턴 (실제 코드)

### 4-1. Button

```tsx
// Primary — 수집 시작, 저장, 확인 등 주요 액션
<button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
  수집 시작
</button>

// Primary Loading 상태 — 버튼 클릭 후 작업 진행 중
<button disabled className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white opacity-70 cursor-not-allowed">
  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>
  수집 중...
</button>

// Secondary (outline) — 설정, 편집, 취소 등 보조 액션
<button className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 disabled:cursor-not-allowed disabled:opacity-40">
  설정
</button>

// Destructive — 삭제, 초기화 등 되돌릴 수 없는 액션
<button className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:cursor-not-allowed disabled:opacity-40">
  삭제
</button>

// Ghost — 사이드바 네비, 팝오버 내 액션 등
<button className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500">
  더보기
</button>
```

**버튼 크기 규칙**

| 크기 | 패딩 | 텍스트 | 용도 |
|------|------|-------|------|
| sm | `px-3 py-1.5` | `text-xs` | 테이블 내 인라인 액션, 뱃지형 버튼 |
| md (기본) | `px-4 py-2` | `text-sm` | 일반 액션 버튼 |
| lg | `px-5 py-3` | `text-base` | 온보딩 CTA, 중요 단독 액션 |

### 4-2. Input / Form

```tsx
// 기본 Input
<input
  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
/>

// 에러 상태
<input className="w-full rounded-lg border border-red-500 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-500" />
<p className="mt-1.5 text-xs text-red-400">에러 메시지</p>

// 비활성 상태
<input disabled className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-500 cursor-not-allowed opacity-50" />

// 코드/URL/API키 전용 Input (font-mono)
<input className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
```

**폼 레이아웃 규칙** — 항상 이 구조를 유지

```tsx
<div className="space-y-1.5">
  <label className="text-sm font-medium text-zinc-200">
    레이블 <span className="text-red-400">*</span>  {/* 필수 필드 */}
  </label>
  <input ... />
  {error && <p className="text-xs text-red-400">{error}</p>}
  {hint && <p className="text-xs text-zinc-500">{hint}</p>}
</div>
```

### 4-3. Card / Panel

```tsx
// 기본 카드
<div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
  {/* 카드 내부에 추가 패딩 금지 */}
</div>

// 구분선이 있는 카드 (헤더+바디)
<div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
  <div className="px-5 py-4 border-b border-zinc-800">
    <h3 className="text-sm font-semibold text-zinc-100">카드 제목</h3>
    <p className="text-xs text-zinc-500 mt-0.5">부제목 또는 설명</p>
  </div>
  <div className="p-5">
    {/* 바디 */}
  </div>
</div>

// 인터랙티브 카드 (클릭 가능)
<div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 cursor-pointer transition-colors hover:border-zinc-700 hover:bg-zinc-800/50">
  {/* 내용 */}
</div>

// 강조 카드 (accent 테두리)
<div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-6">
  {/* 내용 */}
</div>
```

### 4-4. Badge / Tag

```tsx
// 상태별 뱃지 클래스 맵
const badgeVariants = {
  default:   "bg-zinc-800 text-zinc-400 border border-zinc-700",
  success:   "bg-green-950 text-green-300 border border-green-800",
  warning:   "bg-amber-950 text-amber-300 border border-amber-800",
  error:     "bg-red-950 text-red-300 border border-red-800",
  accent:    "bg-blue-950 text-blue-300 border border-blue-800",
  running:   "bg-blue-950 text-blue-300 border border-blue-700 animate-pulse",
}

// 사용 예시
<span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeVariants.success}`}>
  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />  {/* 상태 도트 (선택) */}
  수집 완료
</span>

// 쇼핑몰명 태그 (데이터 테이블 내)
<span className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
  쿠팡
</span>
```

### 4-5. Table

```tsx
<div className="rounded-xl border border-zinc-800 overflow-hidden">
  <table className="w-full text-sm">
    <thead className="bg-zinc-800/50">
      <tr>
        <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          컬럼명
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-zinc-800">
      <tr className="hover:bg-zinc-800/50 transition-colors">
        <td className="px-4 py-3 text-zinc-100">데이터</td>
        <td className="px-4 py-3 font-mono text-zinc-400 text-xs">URL/ID 값</td>
        <td className="px-4 py-3">
          {/* 인라인 액션 버튼 — sm 크기 */}
          <button className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors">
            보기
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### 4-6. Empty State (빈 상태)

```tsx
// 모든 목록/테이블 페이지에 반드시 구현
<div className="flex flex-col items-center justify-center py-20 text-center">
  {/* 아이콘: lucide-react SVG 또는 이모지 */}
  <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-4">
    <svg className="w-6 h-6 text-zinc-500" ... />
  </div>
  <p className="text-sm font-medium text-zinc-300">{title}</p>
  <p className="text-xs text-zinc-500 mt-1 max-w-xs">{description}</p>
  {actionLabel && (
    <button className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
      {actionLabel}
    </button>
  )}
</div>
```

### 4-7. Sidebar Navigation Item

```tsx
// 사이드바 네비 아이템 — 완료/활성/비활성 3가지 상태
<Link
  href="/onboarding"
  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
    isActive
      ? "bg-zinc-800 text-zinc-100"
      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
  }`}
>
  {/* 단계 번호/완료 표시 */}
  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
    isDone
      ? "bg-green-600 text-white"
      : isActive
        ? "bg-blue-600 text-white"
        : "bg-zinc-800 text-zinc-600"
  }`}>
    {isDone ? "✓" : "01"}
  </span>
  <span>온보딩</span>
</Link>
```

---

## 5. 상태 처리 패턴

### 5-1. 로딩 상태 선택 기준

| 상황 | 방식 | 구현 |
|------|------|------|
| 첫 페이지 로드 (데이터 없음) | 스켈레톤 | 실제 레이아웃과 동일한 빈 버전 |
| 버튼 클릭 후 액션 (수집 시작 등) | 버튼 내 스피너 + disabled | 위 4-1 버튼 Loading 패턴 참조 |
| 전체 화면 블로킹 작업 (익스텐션 설치 확인 등) | 오버레이 스피너 | 드물게만 사용 |
| 데이터 리페치 (기존 목록 있음) | 기존 UI 유지 + 상단 진행바 | 스켈레톤으로 교체 금지 |

**스켈레톤 규칙**: `loading.tsx`는 `page.tsx`의 레이아웃을 정확히 미러링해야 함

```tsx
// page.tsx 구조: <Card(헤더+바디)> → <제목> + <테이블>
// loading.tsx:
<div className="py-8 px-6">
  <div className="max-w-5xl mx-auto">
    {/* 페이지 헤더 스켈레톤 */}
    <div className="flex items-center justify-between mb-8">
      <div className="space-y-2">
        <div className="h-7 w-48 bg-zinc-800 rounded-lg animate-pulse" />
        <div className="h-4 w-64 bg-zinc-800 rounded animate-pulse" />
      </div>
      <div className="h-9 w-24 bg-zinc-800 rounded-lg animate-pulse" />
    </div>
    {/* 테이블 스켈레톤 */}
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <div className="h-10 bg-zinc-800/50 border-b border-zinc-800" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-14 border-b border-zinc-800 px-4 flex items-center gap-4">
          <div className="h-4 w-32 bg-zinc-800 rounded animate-pulse" />
          <div className="h-4 w-48 bg-zinc-800 rounded animate-pulse" />
          <div className="h-4 w-20 bg-zinc-800 rounded animate-pulse ml-auto" />
        </div>
      ))}
    </div>
  </div>
</div>
```

### 5-2. 에러 상태

```tsx
// 인라인 에러 (폼 필드)
<p className="text-xs text-red-400 mt-1">{message}</p>

// 섹션 에러 (카드 내)
<div className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 flex items-start gap-3">
  <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" ... />
  <p className="text-sm text-red-300">{message}</p>
</div>

// 페이지 레벨 에러
<div className="flex flex-col items-center py-20">
  <div className="w-12 h-12 rounded-xl bg-red-950 flex items-center justify-center mb-4">
    <svg className="w-6 h-6 text-red-400" ... />
  </div>
  <p className="text-sm font-medium text-red-300">오류가 발생했습니다</p>
  <p className="text-xs text-zinc-500 mt-1">{message}</p>
  <button onClick={retry} className="mt-4 px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-800 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors">
    다시 시도
  </button>
</div>
```

### 5-3. Toast / 알림

```tsx
// Toast 기본 구조
<div className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${variantClasses}`}>
  <svg className="w-4 h-4 shrink-0" ... />
  <p className="font-medium">{message}</p>
  <button className="ml-auto text-current opacity-60 hover:opacity-100">✕</button>
</div>

// Variant 클래스
const toastVariants = {
  success: "bg-green-950 border-green-800 text-green-300",
  error:   "bg-red-950 border-red-800 text-red-300",
  warning: "bg-amber-950 border-amber-800 text-amber-300",
  info:    "bg-blue-950 border-blue-800 text-blue-300",
}
```

| 타입 | 사용 시점 | 지속 시간 |
|------|---------|---------|
| success | 수집 완료, 설정 저장, API 연동 성공 | 3초 자동 닫힘 |
| error | 네트워크 오류, API 키 오류, 권한 오류 | 사용자 닫기 전까지 유지 |
| warning | 되돌릴 수 없는 삭제 전 경고 | 5초 또는 수동 닫기 |
| info | 중립적 안내 (수집 대기 중 등) | 3초 자동 닫힘 |

### 5-4. 진행 상태 표시 (수집 작업 특화)

```tsx
// 수집 진행률 바 (카드 내부)
<div className="space-y-2">
  <div className="flex items-center justify-between text-xs text-zinc-400">
    <span>수집 중...</span>
    <span>{current}/{total} 건</span>
  </div>
  <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
    <div
      className="h-full rounded-full bg-blue-500 transition-all duration-300"
      style={{ width: `${(current / total) * 100}%` }}
    />
  </div>
</div>

// 단계 진행 표시기 (온보딩 등)
<div className="flex items-center gap-2">
  {steps.map((step, i) => (
    <div key={i} className="flex items-center gap-2">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
        i < currentStep ? "bg-green-600 text-white"
        : i === currentStep ? "bg-blue-600 text-white"
        : "bg-zinc-800 text-zinc-600"
      }`}>
        {i < currentStep ? "✓" : i + 1}
      </div>
      {i < steps.length - 1 && (
        <div className={`h-px w-8 ${i < currentStep ? "bg-green-600" : "bg-zinc-800"}`} />
      )}
    </div>
  ))}
</div>
```

---

## 6. 아이콘 시스템

- **단일 소스**: `lucide-react` 전용 — 다른 아이콘 라이브러리 혼용 금지
- 기본 크기: `w-4 h-4` (16px) — 버튼 내, 테이블 내, 인라인 아이콘
- 강조 크기: `w-5 h-5` (20px) — 사이드바 아이콘, 카드 헤더
- 빈 상태/히어로: `w-6 h-6` 이상 허용
- 색상: 부모 텍스트 색 상속 (`currentColor`) — 별도 색상 지정 금지
- 아이콘 단독 버튼에는 반드시 `aria-label` 또는 `title` 추가

**자주 쓰는 아이콘 매핑**

| 용도 | lucide-react 컴포넌트 |
|------|---------------------|
| 수집 시작/실행 | `<Play />` |
| 수집 중지 | `<Square />` |
| 새로고침/재시도 | `<RefreshCw />` |
| 설정 | `<Settings />` |
| API 연동 | `<Plug />` |
| 데이터 내보내기 | `<Download />` |
| 삭제 | `<Trash2 />` |
| 편집 | `<Pencil />` |
| 복사 | `<Copy />` |
| 연결 상태 | `<Wifi />` / `<WifiOff />` |
| 성공 | `<CheckCircle />` |
| 에러 | `<AlertCircle />` |
| 경고 | `<AlertTriangle />` |
| 정보 | `<Info />` |
| 검색 | `<Search />` |
| 필터 | `<Filter />` |
| 뒤로가기 | `<ArrowLeft />` |
| 외부 링크 | `<ExternalLink />` |

---

## 7. 모션 & 트랜지션

```
기본 색상 전환:   transition-colors duration-150 ease-in-out
레이아웃 전환:    transition-all duration-200 ease-in-out
페이드인:         animate-in fade-in duration-200 (tailwindcss-animate 필요)
스케일 팝업:      animate-in zoom-in-95 duration-150
스피너:           animate-spin (버튼 로딩 상태)
스켈레톤:         animate-pulse
진행률 바:        transition-all duration-300 (progress bar 너비 변화)

금지: transition-all을 모든 곳에 기계적으로 적용하는 것 (성능 저하)
금지: duration-500 이상 (느려 보임, 업무 도구 UX에 부적합)
금지: 임의 애니메이션 keyframe 추가 (tailwindcss-animate 범위 내에서만)
```

---

## 8. z-index 계층

| 레이어 | 값 | 요소 |
|--------|----|----|
| base | 0 | 일반 콘텐츠, 카드, 테이블 |
| raised | 10 | 드롭다운, 팝오버, 툴팁 트리거 |
| sticky | 20 | 사이드바 (`sticky top-0`), 테이블 스티키 헤더 |
| overlay | 30 | 모달 배경 (backdrop) |
| modal | 40 | 모달, 다이얼로그, 슬라이드오버 |
| toast | 50 | Toast 알림 |
| tooltip | 60 | 툴팁 |

**규칙**: 임의 z-index(`z-[999]`, `z-[9999]` 등) 사용 금지. 위 계층 외의 값이 필요하면 섹션 12에 등록 후 사용.

---

## 9. 금지 패턴 카탈로그

### 9-1. 색상 하드코딩

```tsx
// ❌
<div className="bg-gray-900 text-white border-gray-700">
// ✅
<div className="bg-zinc-900 text-zinc-100 border-zinc-800">
```

### 9-2. gray 계열 혼용

```tsx
// ❌ gray-* 와 zinc-* 혼용
<div className="bg-zinc-900 border-gray-700 text-gray-300">
// ✅ zinc 계열로 통일
<div className="bg-zinc-900 border-zinc-700 text-zinc-300">
```

### 9-3. 이중 패딩

```tsx
// ❌ Card(p-6) 안에서 또 패딩
<div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
  <div className="p-4">  {/* 이중 패딩 */}
    <p>내용</p>
  </div>
</div>
// ✅
<div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
  <p>내용</p>
</div>
```

### 9-4. 임의 spacing

```tsx
// ❌
<div className="mt-[13px] p-[7px] gap-[11px]">
// ✅ 4px 그리드 값만
<div className="mt-3 p-2 gap-3">
```

### 9-5. 다크모드 조건부 클래스

```tsx
// ❌
className={isDark ? 'bg-zinc-900 text-zinc-100' : 'bg-white text-gray-900'}
// ✅ 항상 다크 고정 (이 프로젝트는 dark-only)
className="bg-zinc-900 text-zinc-100"
```

### 9-6. 이중 헤더

```tsx
// ❌ layout.tsx에도 <h1>, page.tsx에도 <h1>
// ✅ 페이지 제목 <h1>은 page.tsx 한 곳에서만 렌더링
```

### 9-7. font-mono 미사용 (데이터 필드)

```tsx
// ❌ URL, API 키, 상품 ID를 일반 텍스트로 표시
<td className="px-4 py-3 text-zinc-100">{product.id}</td>
// ✅ 식별자/코드값은 font-mono
<td className="px-4 py-3 font-mono text-sm text-zinc-400">{product.id}</td>
```

### 9-8. 아이콘 라이브러리 혼용

```tsx
// ❌ heroicons, react-icons 등 혼용
import { HiHome } from 'react-icons/hi'
// ✅ lucide-react만 사용
import { Home } from 'lucide-react'
```

---

## 10. 페이지 레시피 (복사-붙여넣기 용)

### 10-1. 목록/테이블 페이지 (수집 데이터 목록 등)

```tsx
export default function ListPage() {
  return (
    <div className="py-8 px-6">
      <div className="max-w-5xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">페이지 제목</h1>
            <p className="text-sm text-zinc-400 mt-1">부제목 또는 설명</p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
            + 추가
          </button>
        </div>

        {/* 필터/검색 */}
        <div className="flex gap-3 mb-6">
          <input
            placeholder="검색..."
            className="flex-1 max-w-xs rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* 목록 */}
        {isLoading ? (
          <ListSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            title="아직 데이터가 없습니다"
            description="수집 작업을 추가하거나 익스텐션으로 수집을 시작하세요."
            actionLabel="+ 수집 작업 추가"
          />
        ) : (
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    컬럼명
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-800/50 transition-colors">
                    <td className="px-4 py-3 text-zinc-100">{item.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
```

### 10-2. 상세/뷰어 페이지 (수집 데이터 상세, 쇼핑몰 상세 등)

```tsx
export default function DetailPage() {
  return (
    <div className="py-8 px-6">
      <div className="max-w-4xl mx-auto">
        {/* 뒤로가기 + 헤더 */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            목록으로
          </button>
        </div>
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">{제목}</h1>
            <p className="text-sm text-zinc-400 mt-1">{부제목}</p>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-800 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors">
              편집
            </button>
            <button className="px-4 py-2 rounded-lg bg-red-600 text-sm font-medium text-white hover:bg-red-500 transition-colors">
              삭제
            </button>
          </div>
        </div>

        {/* 섹션들 */}
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">섹션 제목</h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">필드명</span>
                <span className="text-sm text-zinc-100 font-mono">{값}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

### 10-3. 폼/설정 페이지 (API 설정, 익스텐션 설정 등)

```tsx
export default function FormPage() {
  return (
    <div className="py-8 px-6">
      <div className="max-w-xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-100">{폼 제목}</h1>
          <p className="text-sm text-zinc-400 mt-1">{설명}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 필드 그룹 */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">섹션명</h3>
            </div>
            <div className="p-5 space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-200">
                  필드명 <span className="text-red-400">*</span>
                </label>
                <input
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {errors.field && <p className="text-xs text-red-400">{errors.field}</p>}
                <p className="text-xs text-zinc-500">힌트 텍스트</p>
              </div>
            </div>
          </div>

          {/* 액션 */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-800 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  저장 중...
                </>
              ) : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

---

## 11. 주요 기능별 특수 패턴

### 11-1. 데이터 자동 추출 — 수집 상태 카드

```tsx
// 수집 작업 카드 — 상태별 시각적 구분
// status: 'idle' | 'running' | 'done' | 'error'

const statusConfig = {
  idle:    { label: '대기', badge: "bg-zinc-800 text-zinc-400 border-zinc-700", dot: "bg-zinc-500" },
  running: { label: '수집 중', badge: "bg-blue-950 text-blue-300 border-blue-700 animate-pulse", dot: "bg-blue-400 animate-pulse" },
  done:    { label: '완료', badge: "bg-green-950 text-green-300 border-green-800", dot: "bg-green-400" },
  error:   { label: '오류', badge: "bg-red-950 text-red-300 border-red-800", dot: "bg-red-400" },
}

<div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
  {/* 상단: 쇼핑몰 + 상태 */}
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-300">
        {쇼핑몰_이니셜}
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-100">{쇼핑몰명}</p>
        <p className="text-xs text-zinc-500 font-mono">{url}</p>
      </div>
    </div>
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConfig[status].badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${statusConfig[status].dot}`} />
      {statusConfig[status].label}
    </span>
  </div>

  {/* 진행률 (running 상태일 때만) */}
  {status === 'running' && (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-zinc-500">
        <span>수집 중...</span>
        <span>{current} / {total} 건</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${(current/total)*100}%` }} />
      </div>
    </div>
  )}

  {/* 메타 정보 */}
  <div className="flex items-center gap-4 text-xs text-zinc-500">
    <span>마지막 수집: {lastRun}</span>
    <span>총 {count}건</span>
  </div>
</div>
```

### 11-2. API 연동 및 전송 — 연결 상태 표시

```tsx
// API 엔드포인트 설정 카드
<div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
  <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
    <h3 className="text-sm font-semibold text-zinc-100">API 연결 설정</h3>
    {/* 연결 상태 인디케이터 */}
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
      isConnected ? "text-green-400" : "text-zinc-500"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-400" : "bg-zinc-600"}`} />
      {isConnected ? '연결됨' : '미연결'}
    </span>
  </div>
  <div className="p-5 space-y-4">
    {/* Endpoint URL */}
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Endpoint URL</label>
      <div className="flex gap-2">
        <input
          placeholder="https://api.yourservice.com/collect"
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button className="px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors whitespace-nowrap">
          연결 테스트
        </button>
      </div>
    </div>

    {/* API Key */}
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">API Key</label>
      <div className="relative">
        <input
          type={showKey ? "text" : "password"}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 pr-10 font-mono text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>

    {/* 전송 결과 미리보기 (성공/실패) */}
    {testResult && (
      <div className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${
        testResult.ok
          ? "bg-green-950 border-green-800"
          : "bg-red-950 border-red-800"
      }`}>
        {testResult.ok
          ? <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
          : <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />}
        <div>
          <p className={`text-xs font-medium ${testResult.ok ? "text-green-300" : "text-red-300"}`}>
            {testResult.ok ? '연결 성공' : '연결 실패'}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5 font-mono">{testResult.message}</p>
        </div>
      </div>
    )}
  </div>
</div>
```

### 11-3. 익스텐션 설정 — 설치 상태 & 설정 가이드

```tsx
// 익스텐션 설치 확인 배너
{!extensionInstalled && (
  <div className="rounded-xl border border-amber-800 bg-amber-950/50 px-5 py-4 flex items-center gap-4 mb-6">
    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
    <div className="flex-1">
      <p className="text-sm font-medium text-amber-300">크롬 익스텐션이 설치되어 있지 않습니다</p>
      <p className="text-xs text-amber-400/70 mt-0.5">데이터 수집을 시작하려면 먼저 익스텐션을 설치하세요.</p>
    </div>
    <a
      href="chrome://extensions"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-xs font-medium text-white hover:bg-amber-500 transition-colors"
    >
      설치 가이드
      <ExternalLink className="w-3 h-3" />
    </a>
  </div>
)}

// 수집 필드 설정 (체크박스 그룹)
<div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
  <div className="px-5 py-4 border-b border-zinc-800">
    <h3 className="text-sm font-semibold text-zinc-100">수집할 필드 선택</h3>
    <p className="text-xs text-zinc-500 mt-0.5">수집된 데이터에 포함할 상품 정보를 선택하세요.</p>
  </div>
  <div className="p-5 grid grid-cols-2 gap-3">
    {fields.map((field) => (
      <label key={field.key} className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors">
        <input
          type="checkbox"
          checked={selected.includes(field.key)}
          onChange={...}
          className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900"
        />
        <div>
          <p className="text-sm font-medium text-zinc-200">{field.label}</p>
          <p className="text-xs text-zinc-500">{field.description}</p>
        </div>
      </label>
    ))}
  </div>
</div>
```

### 11-4. 쇼핑몰 호환성 — 쇼핑몰 목록 및 상태

```tsx
// 쇼핑몰 호환성 테이블
<div className="rounded-xl border border-zinc-800 overflow-hidden">
  <table className="w-full text-sm">
    <thead className="bg-zinc-800/50">
      <tr>
        <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">쇼핑몰</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">도메인</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">지원 필드</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">상태</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">마지막 검증</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-zinc-800">
      {shops.map((shop) => (
        <tr key={shop.id} className="hover:bg-zinc-800/50 transition-colors">
          <td className="px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">
                {shop.name[0]}
              </div>
              <span className="font-medium text-zinc-100">{shop.name}</span>
            </div>
          </td>
          <td className="px-4 py-3 font-mono text-xs text-zinc-400">{shop.domain}</td>
          <td className="px-4 py-3">
            <div className="flex flex-wrap gap-1">
              {shop.supportedFields.map((f) => (
                <span key={f} className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700">{f}</span>
              ))}
            </div>
          </td>
          <td className="px-4 py-3">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
              shop.status === 'active' ? "bg-green-950 text-green-300 border-green-800"
              : shop.status === 'partial' ? "bg-amber-950 text-amber-300 border-amber-800"
              : "bg-red-950 text-red-300 border-red-800"
            }`}>
              {shop.status === 'active' ? '정상' : shop.status === 'partial' ? '부분지원' : '미지원'}
            </span>
          </td>
          <td className="px-4 py-3 text-xs text-zinc-500">{shop.lastVerified}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

### 11-5. 데이터 관리 — 수집 결과 표시

```tsx
// 수집된 상품 데이터 상세 뷰 (Key-Value 그리드)
<div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
  <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
    <h3 className="text-sm font-semibold text-zinc-100">수집 데이터</h3>
    <div className="flex gap-2">
      <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors">
        <Copy className="w-3 h-3" />
        JSON 복사
      </button>
      <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors">
        <Download className="w-3 h-3" />
        CSV
      </button>
    </div>
  </div>
  <div className="divide-y divide-zinc-800">
    {Object.entries(productData).map(([key, value]) => (
      <div key={key} className="px-5 py-3 flex items-baseline gap-4">
        <span className="w-32 shrink-0 text-xs font-medium text-zinc-500 uppercase tracking-wider">{key}</span>
        <span className={`text-sm ${
          typeof value === 'number' ? "font-mono text-blue-300"
          : key.toLowerCase().includes('url') ? "font-mono text-zinc-400 truncate"
          : key.toLowerCase().includes('price') ? "font-mono font-medium text-zinc-100"
          : "text-zinc-100"
        }`}>{String(value)}</span>
      </div>
    ))}
  </div>
</div>

// 전송 이력 타임라인
<div className="space-y-2">
  {transmissions.map((tx) => (
    <div key={tx.id} className="flex items-start gap-3 text-xs">
      <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
        tx.status === 'success' ? 'bg-green-400' : 'bg-red-400'
      }`} />
      <div className="flex-1 flex items-center justify-between">
        <span className="text-zinc-400">{tx.endpoint}</span>
        <span className="font-mono text-zinc-600">{tx.timestamp}</span>
      </div>
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
        tx.status === 'success' ? 'bg-green-950 text-green-400' : 'bg-red-950 text-red-400'
      }`}>
        {tx.status === 'success' ? `${tx.statusCode} OK` : `${tx.statusCode} ERR`}
      </span>
    </div>
  ))}
</div>
```

---

## 12. 예외 처리 & 토큰 갭

| 예외 페이지/컴포넌트 | 이유 | 허용된 이탈 |
|-------------------|------|-----------|
| 404 / 에러 페이지 | 전체 레이아웃 없음 | 풀스크린 센터 레이아웃, 사이드바 없음 |
| 온보딩 랜딩 (`/`) | 사이드바 없는 독립 화면 | `min-h-screen flex items-center justify-center` |
| 크롬 익스텐션 팝업 UI | 380px 고정 너비, 풀스크린 아님 | 전용 좁은 레이아웃, max-w 제한 해제 |
| (추가 예외 발견 시 여기에 등록) | | |

**토큰 갭** — CSS 변수에 없지만 현재 사용 중인 값 (추후 변수로 편입 예정)

| 임시 허용 값 | 사용 위치 | 편입 예정 토큰명 |
|------------|---------|---------------|
| `bg-zinc-800/50` (50% opacity) | 테이블 헤더, 카드 호버 | `--bg-muted-hover` |
| `border-blue-500/30` | 강조 카드 테두리 | `--border-accent-subtle` |
| `bg-blue-950/20` | 강조 카드 배경 | `--bg-accent-faint` |
| `text-[10px]` | 쇼핑몰 태그, 배지 초소형 | `text-2xs` (스케일 등록 후 전환) |

---

이 가이드는 **Next.js (App Router) + Tailwind CSS + Geist 폰트** 기술 스택을 기준으로 작성되었습니다.  
새 페이지/컴포넌트 작업 시 **섹션 10 레시피를 복사**한 뒤 섹션 1~8을 참조하여 값을 채우세요.  
가이드와 충돌하는 기존 코드를 발견하면 섹션 9를 기준으로 수정하고, 예외라면 섹션 12에 등록하세요.
