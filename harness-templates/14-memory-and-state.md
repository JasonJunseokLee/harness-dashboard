# 14. 메모리 & 상태 관리 원칙 — 쇼핑몰 데이터 수집 크롬 익스텐션 맞춤판

> 이 익스텐션은 DOM 파서, 전송 엔진, Popup UI, 설정 관리 등 **여러 레이어에 걸친 복잡도**를 가진다.
> 세션이 바뀌어도 "어떤 쇼핑몰에서 왜 파싱이 깨졌는지", "어떤 선택이 범용성을 지켰는지"를 잃지 않는 것이 핵심이다.

---

## 핵심 구분: 상태 vs 메모리

| 구분 | 상태 (State) | 메모리 (Memory) |
|------|-------------|----------------|
| **용도** | 현재 스프린트 진행 추적 | 미래 세션을 위한 학습 |
| **수명** | 현재 스프린트/세션 | 프로젝트 전체 수명 |
| **저장 위치** | `.harness/` 폴더 | `memory/` 폴더 |
| **예시** | Sprint 2 파싱 엔진 진행 현황 | "Coupang은 Shadow DOM이라 querySelector 단독 사용 불가" |

```
chrome-extension/
├── .harness/                    ← 상태: 현재 스프린트 진행 문서
│   ├── spec.md
│   ├── sprint-contract.md
│   ├── completion-report.md
│   └── qa-discussion.md
│
└── memory/                      ← 메모리: 미래 세션을 위한 학습
    ├── MEMORY.md                ← 인덱스 (항상 로드됨)
    ├── project_*.md             ← 기술 결정 / 아키텍처 선택
    ├── feedback_*.md            ← 파싱 실패 패턴 / 작업 방식
    └── reference_*.md           ← Chrome API 문서, 외부 엔드포인트
```

---

## 이 프로젝트에서 저장해야 하는 것

### 반드시 남겨야 할 메모리 유형

| 유형 | 이 프로젝트 예시 | 타입 |
|------|---------------|------|
| **쇼핑몰별 파싱 특이사항** | "Coupang은 lazy-load 이미지 — scroll trigger 후 src 추출" | `feedback` |
| **범용 파서 한계 결정** | "리뷰 페이지네이션은 MVP에서 제외 — 무한 스크롤 대응 복잡도 과도" | `project` |
| **Chrome API 동작 차이** | "MV3에서 background script는 Service Worker — 지속 상태 저장 불가, chrome.storage 사용 필수" | `feedback` |
| **전송 실패 패턴** | "CORS 오류는 content script에서 fetch 시 발생 — background로 위임해야 함" | `feedback` |
| **사용자 선호** | "팝업 UI는 단계별 진행 표시 선호 — 스피너만으론 불안해함" | `feedback` |
| **인증 토큰 저장 방식 결정** | "토큰은 chrome.storage.local 사용 — sync는 용량 제한(8KB)으로 부적합" | `project` |
| **빌드 특이사항** | "content_script는 Rollup 번들 분리 필요 — Vite 단일 번들과 충돌" | `feedback` |

### 저장하지 않는 것

| 저장 금지 | 대신 사용할 것 |
|----------|-------------|
| DOM 선택자 패턴 코드 | 코드베이스 직접 읽기 (`grep`) |
| manifest.json 구조 | 파일 직접 확인 |
| 최근 커밋 내역 | `git log` |
| 현재 파싱 성공률 수치 | `.harness/completion-report.md` |

---

## 언제 메모리에 저장하는가

### 이 프로젝트 스프린트별 저장 시점

```
Sprint 0 — 셋업
  ✏️ 저장: 기술 스택 최종 결정 + 이유 (project)
  ✏️ 저장: MV3 제약사항 중 예상과 달랐던 것 (feedback)

Sprint 1 — Popup UI & 기본 데이터 흐름
  ✏️ 저장: content script ↔ background 통신 방식 결정 (project)
  ✏️ 저장: chrome.storage 용량/타입별 선택 이유 (project)

Sprint 2 — 범용 DOM 파서
  ✏️ 저장: 파서가 실패한 쇼핑몰 유형 + 원인 (feedback)  ← 가장 중요
  ✏️ 저장: Shadow DOM / iframe / lazy-load 대응 결정 (feedback)
  ✏️ 저장: 추출 범위를 MVP에서 제한한 항목 + 이유 (project)

Sprint 3 — 전송 엔진
  ✏️ 저장: CORS 우회 방법 결정 (background delegation) (feedback)
  ✏️ 저장: 재시도/실패 처리 정책 (project)

Sprint 4+ — 다중 쇼핑몰 커버리지
  ✏️ 저장: 쇼핑몰 유형 분류 기준 (일반 / SPA / 모바일웹) (project)
  ✏️ 저장: 반복되는 파싱 실패 패턴 (feedback)
```

---

## 이 프로젝트 메모리 예시

### 예시 1 — 파싱 실패 패턴 (feedback)

```markdown
---
name: lazy-load-이미지-파싱
description: Lazy-load 이미지는 즉시 src 추출 불가 — scroll 트리거 후 추출 필요
type: feedback
---

일부 쇼핑몰(쿠팡, 11번가 등)은 상품 이미지에 lazy-load 적용.
초기 DOM에는 `data-src`만 있고 `src`가 비어있음.

**Why:** Sprint 2에서 이미지 추출 QA FAIL. src="" 로 수집됨.
**How to apply:** 이미지 추출 시 `src` 없으면 `data-src`, `data-lazy-src` 순서로 fallback.
또는 scroll event 후 100ms 대기 후 재추출 옵션 제공.
```

### 예시 2 — Chrome API 결정 (project)

```markdown
---
name: mv3-background-service-worker
description: MV3 background는 Service Worker — 지속 상태 저장 불가, chrome.storage 필수
type: project
---

MV3의 background script는 Service Worker로 동작.
인메모리 변수는 비활성화 시 초기화됨.
토큰, 설정, 수집 상태는 반드시 chrome.storage에 저장해야 함.

**Why:** Sprint 1에서 토큰이 팝업 닫은 뒤 사라지는 버그 발생.
**How to apply:** background에서 상태 유지가 필요한 모든 데이터는 chrome.storage.local 사용.
fetch 결과 캐싱도 chrome.storage 활용.
```

---

## 스프린트 간 핸드오프 템플릿

```markdown
## 핸드오프 — Sprint {N} → Sprint {N+1}

### 완료된 것
- {달성 항목}

### 미완료 → 이월
- {항목}: {이유}

### 파서 커버리지 현황
| 쇼핑몰 유형 | 성공 | 실패 원인 | 이월 여부 |
|-----------|-----|---------|---------|
| 일반 정적 HTML | ✅ | - | - |
| SPA (React/Vue) | ⚠️ | 렌더링 타이밍 | Sprint N+1 |

### 변경된 가정
- {가정}: {원래} → {변경됨}

### 다음 스프린트에 영향
- {발견 사항}

### 기술 부채
- {부채}: {이유} → {해결 시점}
```

---

## 새 세션 시작 시 읽는 순서

```
1. CLAUDE.md                          ← 익스텐션 프로젝트 규칙
2. memory/MEMORY.md                   ← 파싱 실패 패턴, 기술 결정 인덱스
3. .harness/spec.md                   ← 전체 기능 스펙
4. .harness/sprint-contract.md        ← 현재 스프린트 목표
5. .harness/qa-discussion.md          ← 최근 QA FAIL 항목
6. 관련 memory/ 파일                  ← 예: "오늘 DOM 파서 작업이면 파싱 실패 패턴 메모리 확인"
```

---

## 메모리 위생 체크리스트 (매 스프린트 종료 시)

- [ ] 더 이상 지원하지 않는 쇼핑몰 관련 메모리 삭제/수정
- [ ] "파싱 안 됨" 수준의 모호한 피드백 → 구체적 원인/해결법으로 갱신
- [ ] Chrome API 버전 업데이트로 무효화된 내용 확인
- [ ] MEMORY.md 인덱스 200줄 이하 유지

---

## 금지 사항

- DOM 선택자 패턴을 메모리에 저장하지 않는다 — 코드가 정답이다
- 쇼핑몰별 수집 성공/실패 수치 목록을 메모리에 넣지 않는다 — `.harness/completion-report.md`에 넣는다
- "나중에 확인할 것" TODO를 메모리에 넣지 않는다 — Task 도구를 사용한다
- 모든 파싱 예외 케이스를 메모리에 넣지 않는다 — "다음 세션에서 이걸 모르면 같은 실수를 반복하는가?" 기준을 통과한 것만
