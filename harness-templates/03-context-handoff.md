# 03. 컨텍스트 핸드오프 — 쇼핑몰 데이터 수집 크롬 익스텐션 맞춤판

> 이 프로젝트는 Sprint 0~6의 7개 스프린트, 10~12주 작업입니다.
> 범용 DOM 파서 개발 특성상 "이전 결정과 모순되는 구현"이 발생하기 쉬우므로 핸드오프가 특히 중요합니다.

---

## 이 프로젝트에서 컨텍스트 붕괴가 특히 위험한 이유

| 붕괴 유형 | 이 프로젝트 구체 위험 |
|---|---|
| **압축** (지시사항 망각) | 범용 파서의 "쇼핑몰 비종속" 원칙을 잊고 특정 사이트 하드코딩 |
| **일관성 상실** | DOM 파싱 전략(유사도 기반 vs 규칙 기반)을 스프린트마다 다르게 적용 |
| **조정 실패** | Popup UI ↔ Content Script ↔ Background Worker 메시지 포맷이 에이전트별로 달라짐 |

---

## 핸드오프 파일 구조

```
.harness/
├── spec.md                    # 제품 스펙 (기능 정의, 비종속 원칙)
├── sprint-contract.md         # 현재 스프린트 목표 + 완료 기준
├── sprint-N-result.md         # 스프린트 N 구현 결과 (Generator)
├── sprint-N-eval.md           # 스프린트 N 평가 (Evaluator)
├── handoff.md                 # 세션 간 핸드오프 (컨텍스트 리셋 시)
├── decisions.md               # 누적 결정 기록 (기술 선택 근거 포함)
└── design-system/
    └── design-guide.md        # 디자인 시스템 (Popup UI 구현 시 필수 참조)
```

---

## 세션 간 핸드오프 템플릿

```markdown
# 핸드오프 문서 — 쇼핑몰 데이터 수집 크롬 익스텐션

## 프로젝트 개요
- Chrome MV3 익스텐션, 범용 DOM 파서로 상품 정보 자동 추출 → 외부 API 전송
- 기술 스택: Chrome MV3 / TypeScript / React+Vite (Popup) / Chrome Storage API

## 현재 진행 상태
- [x] Sprint 0: 프로젝트 셋업 완료 여부
- [ ] Sprint 1: Content Script + DOM 파서 기초
- [ ] Sprint 2~6: ...

## 핵심 결정사항
1. **DOM 파싱 전략**: [결정 내용] — 이유: [근거]
2. **외부 전송 포맷**: [JSON 스키마] — 이유: [근거]
3. **메시지 패싱 구조**: Popup ↔ Background ↔ Content Script 프로토콜
4. **인증 방식**: 토큰 저장 위치 (chrome.storage.sync vs local) — 이유: [근거]

## 알려진 이슈
- [이슈]: 설명 + 우선순위

## 다음 단계
1. [즉시 해야 할 것]
2. [그 다음]

## 참조 파일
- 스펙: `.harness/spec.md`
- 최근 평가: `.harness/sprint-N-eval.md`
- 디자인: `.harness/design-system/design-guide.md`
- 결정 기록: `.harness/decisions.md`
```

---

## 에이전트 간 핸드오프 템플릿

```markdown
# [발신] → [수신] 핸드오프

## 전달 내용
- 예: "Content Script DOM 파싱 로직 v1 완성 → Popup UI 연동 에이전트로 전달"

## 맥락
- 현재 추출 결과 JSON 스키마: { name, price, images[], options[], reviews[] }
- 메시지 패싱 방식: chrome.runtime.sendMessage 사용
- Popup에서 chrome.tabs.sendMessage로 Content Script 호출

## 기대 행동
- 추출 결과를 Popup 미리보기 화면에 렌더링
- 전송 버튼 클릭 시 Background Worker로 API 전송 위임

## 제약 조건
- DOM 파서 로직은 수정하지 말 것 (범위 밖)
- 쇼핑몰별 특수 처리 코드 추가 금지 (범용성 원칙 위반)
```

---

## 이 프로젝트 특화 핵심 결정 체크리스트

핸드오프 시마다 아래 항목이 decisions.md에 기록되어 있는지 확인:

- [ ] DOM 파싱 알고리즘 방식 (heuristic / ML / rule-based)
- [ ] 추출 데이터 JSON 스키마 버전
- [ ] Popup ↔ Background ↔ Content Script 메시지 포맷
- [ ] 인증 토큰 저장 위치 및 갱신 로직
- [ ] 외부 API 엔드포인트 등록 방식
- [ ] 자동 전송 트리거 조건

---

## 컨텍스트 리셋 타이밍

| 상황 | 행동 |
|---|---|
| 스프린트 경계 (매 Sprint 완료 시) | 자연 핸드오프 → `sprint-N-result.md` 작성 후 새 세션 |
| 컨텍스트 70~80% 소진 | 즉시 `handoff.md` 업데이트 → 리셋 |
| 범용 파서 원칙 위반 코드를 작성하려 할 때 | 즉시 멈추고 `decisions.md` 재확인 |

---

## Ralph Loop 적용 기준

이 프로젝트에서 Ralph Loop가 특히 필요한 순간:

- **Sprint 1 DOM 파서 설계**: 알고리즘 선택이 전체 커버리지를 결정 → 90분 넘으면 루프
- **Sprint 3 다중 쇼핑몰 테스트**: 쇼핑몰별 예외 처리가 누적되면서 일관성 무너지기 쉬움
- **Sprint 5 안정화**: 이전 결정들이 많아 모순 발생 위험 최고조

Ralph Loop 비용은 약 15~20% 토큰 오버헤드지만, 범용성 원칙 훼손으로 인한 재개발 비용이 훨씬 크다.

---

## 절대 하지 말아야 할 것

- ❌ "이전에 파서 짠 것처럼 해줘" (모호 — 파서 버전·스키마 명시 필수)
- ❌ 핸드오프 없이 새 세션에서 Content Script 이어서 수정
- ❌ 특정 쇼핑몰 이름이 코드에 하드코딩된 채로 스프린트 완료 처리
- ❌ decisions.md 없이 메시지 포맷 임의 변경
