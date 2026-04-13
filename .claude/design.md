# 대화형 수정 기능 설계 (Task #1 완료)

## 핵심 요약

기존 setup 페이지의 검증된 패턴 (RefinementPanel + VersionHistoryPanel + APIVersionManager)을 추출/일반화해서 prd, sprint-plan, ralph-loop, onboarding 페이지에 적용.

---

## 1. 현황 분석

### ✅ 이미 구현된 것 (setup 페이지)
- API: `/api/ai-results/claude-md/refine` — SSE 스트리밍
- 저장: `AIVersionManager` (`.harness/ai-results/{phase}/` 버전 관리)
- UI: `RefinementPanel` (입력), `VersionHistoryPanel` (버전), `VersionDiffViewer` (비교)
- 패턴: `spawn('claude', ['-p', ...])` + JSON 스트림

### ❌ 아직 없는 것
- onboarding, prd, sprint-plan, ralph-loop: 수정 기능 0
- API/컴포넌트가 `claude-md`로 하드코딩됨

---

## 2. 설계 결정

### 결정 1: 섹션 선택 UI ❌ → 자연어 지시사항 ✅
- "사용자 문제를 더 구체적으로" 같은 자연어로 지시
- 따로 섹션 선택 UI를 만들지 않음 (복잡성 ↑, 기존 패턴과 일관성)

### 결정 2: 섹션 단위 수정 ❌ → 전체 파일 수정 ✅
- claude-md(마크다운) = 전체 파일
- prd/sprint-plan/ralph-loop(JSON) = 전체 JSON 수정
- AIVersionManager가 파일 단위 버전 관리 → 일관성 유지

### 결정 3: JSON 파싱 검증 필수
- 마크다운: 그대로 저장
- JSON: `JSON.parse` 실패 시 버전 저장 ❌, 에러 표시
- 백틱 제거 등 기본적인 정제만 수행

### 결정 4: 수락/거절 버튼 ❌ → 자동 저장 + 버전 복원 ✅
- 완료 시 자동 저장
- 마음에 안들면 버전 히스토리에서 복원

---

## 3. 구현 아키텍처

### API: `/api/ai-results/[phase]/refine/route.ts`

```
입력:  { instruction, context, format }
처리:  spawn('claude', ['-p', PROMPT_TEMPLATE[phase](context, instruction)])
출력:  SSE { type: 'text|done|error', ... }
저장:  AIVersionManager.saveVersion(...) → .harness/ai-results/{phase}/
```

Phase 목록:
- `claude-md` (마크다운)
- `prd`, `sprint-plan`, `ralph-loop` (JSON)
- `onboarding-analysis`, `onboarding-questions` (JSON, 선택사항)

### 컴포넌트: `useAIRefinement` 훅

setup 페이지의 handleRefine/handleRestore/handleSelectVersion을 추출 → 재사용 가능한 훅

```ts
useAIRefinement({ phase, format, currentContent, onContentChange, ... })
// ↓
{ isRefining, refineProgress, currentVersion, versionRefresh, handleRefine, handleRestore, handleSelectVersion }
```

### UI 컴포넌트 수정

| 컴포넌트 | 변경 |
|---------|------|
| `RefinementPanel` | `presets` prop 추가 (phase별) |
| `VersionHistoryPanel` | `phase` prop 추가 |
| `VersionDiffViewer` | `phase` prop 추가 |

---

## 4. 페이지별 적용

| 페이지 | Phase | Format | Status |
|--------|-------|--------|--------|
| setup | `claude-md` | markdown | ✅ 기존 (마이그레이션 선택사항) |
| prd | `prd` | json | 🚀 우선순위 1 |
| sprint-plan | `sprint-plan` | json | 🚀 우선순위 2 |
| ralph-loop | `ralph-loop` | json | 🚀 우선순위 3 |
| onboarding | `onboarding-*` | json | ⏸️ 보류 (피드백 후) |
| features | - | - | ❌ 제외 |
| workflow | - | - | ❌ 제외 |

---

## 5. 개발 단계 (Task #2, #3용)

### Phase A: 백엔드 (Task #2)
1. `/api/ai-results/[phase]/refine/route.ts` 생성
2. `/api/ai-results/[phase]/versions/route.ts`, `[v]/route.ts` 생성
3. `/api/ai-results/[phase]/restore/route.ts` 생성
4. `/api/ai-results/[phase]/diff/route.ts` 생성
5. 기존 claude-md 라우트는 유지

### Phase B: 훅 & 컴포넌트 (Task #3)
1. `app/lib/useAIRefinement.ts` 작성
2. 기존 컴포넌트에 `phase`/`presets` prop 추가
3. PRD 페이지 적용 (2칼럼 레이아웃: 뷰어 + 사이드패널)
4. sprint-plan, ralph-loop 적용
5. setup 마이그레이션 (선택)

---

## 6. 프롬프트 템플릿 (phase별)

```ts
// claude-md: 마크다운 전체 수정
`[중요] 도구 사용 금지, stdout으로 마크다운만 출력.
기존 CLAUDE.md:
${context}

수정 요청: ${instruction}

전체를 수정해서 출력. 변경 안 하는 부분도 포함.`

// prd/sprint-plan/ralph-loop: JSON 전체 수정
`[중요] 도구 사용 금지, stdout으로 JSON만 출력 (백틱/주석 없이).
기존 JSON:
${context}

수정 요청: ${instruction}

전체 JSON을 출력. 스키마 유지. 변경 안 하는 필드도 포함.`
```

---

## 7. Phase별 프리셋

| Phase | 프리셋 |
|-------|--------|
| claude-md | "한글 주석 더 자세히", "테스트 추가", "DoD 강화", "금지 패턴 추가" |
| prd | "문제 정의 구체적으로", "KPI 숫자 목표 추가", "리스크 3개 더", "차별점 강화" |
| sprint-plan | "기간 2주로", "우선순위 조정", "리스크 완화 추가" |
| ralph-loop | "루프 조건 엄격하게", "실패 처리 추가", "성공 기준 명확화" |

---

## 8. 주의사항

1. **JSON 파싱 실패**: 백틱 제거 → `JSON.parse` 시도 → 실패 시 에러 표시, 버전 미저장
2. **동시 요청**: `isRefining` 상태로 버튼 비활성화
3. **버전 격리**: 각 phase별 디렉토리 분리 → 충돌 없음
4. **하위 호환성**: 기존 `claude-md` 라우트 유지

---

## ✅ 결론

**이 설계는 기존 검증된 패턴 활용** → 새 기능 도입 없음, 복잡성 최소, 일관성 최대.

Task #2(백엔드) → Task #3(프론트엔드) 순서로 Phase A → B → C 진행.
