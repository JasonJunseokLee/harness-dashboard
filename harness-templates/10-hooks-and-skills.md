# 10. Hooks & Skills 설계 가이드
> 쇼핑몰 데이터 수집 크롬 익스텐션 맞춤형

---

## 개요: 3가지 확장 메커니즘

| 메커니즘 | 한 줄 설명 | 이 프로젝트에서의 역할 |
|----------|-----------|----------------------|
| **Hook** | 이벤트 발생 시 **결정적으로 실행**되는 셸 스크립트 | 빌드 전 manifest 검증, 위험 파일 보호 |
| **Skill** | LLM이 **자동으로 활성화**하는 도메인 전문성 | DOM 파서 리뷰, MV3 규칙 안내 |
| **Subagent** | **격리된 컨텍스트**에서 작동하는 특수 에이전트 | 쇼핑몰 커버리지 테스트, 병렬 파서 검증 |

> **핵심 원칙**: "Hooks는 실행을 **보장**한다; 프롬프트는 보장하지 않는다."
> 
> 인증 토큰 유출, manifest.json 파손, content_script 권한 오류는 Hook으로 방어해야 한다.

---

## Hooks — 이 프로젝트 필수 게이트

### Exit Code 원칙 (반드시 숙지)

| Exit Code | 의미 | 동작 |
|-----------|------|------|
| **0** | 성공 | 작업 진행 |
| **2** | 차단 에러 | **작업 중단** ← 보안 게이트는 반드시 이것 |
| **1, 3+** | 비차단 경고 | 경고만 표시, 작업은 계속 진행 |

```bash
# ❌ 위험: 인증 토큰이 코드에 하드코딩되어도 그냥 실행됨
if grep -r "Bearer sk-" src/; then
    echo "토큰 감지됨"
    exit 1  # 커밋이 그대로 진행!
fi

# ✅ 안전: 토큰 하드코딩 시 커밋 차단
if grep -r "Bearer sk-\|authToken.*=.*['\"]ey" src/; then
    echo "❌ 인증 토큰 하드코딩 감지 — 커밋 차단"
    exit 2  # 커밋 차단
fi
```

---

### 이 프로젝트 권장 Hook 목록

#### 1. TypeScript 빌드 검증 (PostToolUse)
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "bash .claude/hooks/check-ts.sh"
      }
    ]
  }
}
```
```bash
# .claude/hooks/check-ts.sh
# content_script, background, popup 중 하나라도 수정되면 타입 검사
if echo "$FILE_PATH" | grep -E "(content|background|popup|service-worker)" > /dev/null; then
    npx tsc --noEmit || exit 2
fi
```

#### 2. manifest.json 보호 (PreToolUse)
```bash
# .claude/hooks/protect-manifest.sh
# manifest.json 직접 수정 시 확인 요청
if [[ "$FILE_PATH" == *"manifest.json"* ]]; then
    echo "⚠️ manifest.json 수정 감지 — permissions/content_scripts 변경 시 MV3 규칙 준수 필요"
    # exit 1: 경고만 (차단하지 않음)
    exit 1
fi
```

#### 3. 인증 토큰 하드코딩 차단 (PreToolUse)
```bash
# .claude/hooks/block-token-hardcode.sh
# API 토큰, Bearer, authToken 등이 소스에 직접 삽입되면 차단
if grep -E "(authToken|apiKey|Bearer)\s*[:=]\s*['\"][A-Za-z0-9+/]{20,}" "$FILE_PATH" 2>/dev/null; then
    echo "❌ 인증 정보 하드코딩 차단 — Chrome Storage API를 사용하세요"
    exit 2
fi
```

#### 4. 빌드 후 자동 포맷팅 (PostToolUse)
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "npx prettier --write $FILE_PATH 2>/dev/null; exit 0"
      }
    ]
  }
}
```

---

### Hook 설계 주의사항 (Chrome Extension 특수 사항)

- **2초 이내**: Hook 지연이 2초를 넘으면 체감 성능 저하 — `tsc --noEmit`은 느릴 수 있으므로 파일 경로 필터링으로 범위 제한
- **서비스 워커 분리**: `background/service-worker.ts`는 DOM API 접근 불가 — Hook으로 `window.*` 사용 감지 가능
- **content_script ↔ background 통신**: `chrome.runtime.sendMessage` 타입 오류는 컴파일 전 차단

---

## Skills — 이 프로젝트 권장 Skill

### 1. Chrome MV3 규칙 안내 Skill
```yaml
# .claude/skills/mv3-rules.md
---
name: mv3-rules
description: >
  Chrome Manifest V3 익스텐션 규칙, 권한 모델, 서비스 워커 제약,
  content_script 보안 컨텍스트, chrome.* API 사용법을 안내합니다.
  manifest.json 수정, background 로직 작성, permission 추가 요청 시 활성화합니다.
allowed-tools: Read, Grep
---
```

**활성화 시나리오**: "background에서 DOM 접근하고 싶어요", "manifest에 permissions 추가하려면?", "서비스 워커에서 fetch 쓸 수 있나요?"

---

### 2. DOM 파서 리뷰 Skill
```yaml
# .claude/skills/dom-parser-review.md
---
name: dom-parser-review
description: >
  범용 DOM 파서의 선택자 신뢰성, 사이트 구조 변경 취약성, 추출 정확도를 검토합니다.
  content_script 파일 수정, 파서 로직 변경, 새 쇼핑몰 추가 시 활성화합니다.
allowed-tools: Read, Grep, Glob
---

## 검토 기준
1. 특정 사이트 고유 class명에 의존하는지 (취약)
2. 시맨틱 태그 / 구조적 선택자를 우선 사용하는지 (권장)
3. 가격/이미지 추출 시 fallback 전략이 있는지
4. 동적 렌더링(SPA) 대응 로직이 있는지
```

---

### 3. 보안 리뷰 Skill (인증 토큰 & 전송 검증)
```yaml
# .claude/skills/security-review.md
---
name: security-review
description: >
  인증 토큰 관리, 엔드포인트 전송 보안, Chrome Storage 사용 적절성을 검토합니다.
  authToken, apiKey, fetch, sendMessage, storage 관련 코드 수정 시 활성화합니다.
allowed-tools: Read, Grep
---

## 검토 기준
1. 토큰이 chrome.storage.sync에 저장되는지 (소스 코드 하드코딩 금지)
2. 외부 API 전송 시 HTTPS 강제 여부
3. 데이터 전송 전 사용자 확인 단계 존재 여부
4. content_script에서 민감 정보 콘솔 출력 여부
```

---

### Description 작성 원칙

```yaml
# ❌ 너무 넓음 — 거의 모든 세션에서 활성화
description: "크롬 익스텐션 관련 도움을 줍니다"

# ❌ 너무 좁음 — 필요한 때에도 안 켜짐
description: "쿠팡 상품명 추출 선택자만 검토"

# ✅ 적절한 범위
description: >
  DOM 파서의 선택자 신뢰성과 범용성을 검토합니다.
  content_script 수정, 새 쇼핑몰 파서 추가, 추출 로직 변경 시 활성화합니다.
```

> **컨텍스트 예산**: 모든 Skill description 합산 ~2% (약 16,000자) 공유. Skill은 3~4개 이내로 유지.

---

## Subagents — 병렬 검증 패턴

### 쇼핑몰 커버리지 병렬 테스트
```
파서 로직 변경 시
  ├── Subagent A — 쿠팡/네이버 스마트스토어 선택자 검증
  ├── Subagent B — 11번가/G마켓 선택자 검증
  └── Subagent C — 해외몰 (아마존 등) 선택자 검증
  = 병렬로 커버리지 확인, 메인 컨텍스트 보호
```

### Worktree 격리 — 파서 알고리즘 실험
```
메인 코드베이스 (안전)
    │
    └── Worktree (임시)
        ├── 새 DOM 파싱 알고리즘 시도
        ├── 성공 시 → 병합
        └── 실패 시 → 폐기 (메인 무영향)
```

**적합한 상황:**
- 범용 파서 알고리즘을 전면 교체하는 경우
- 여러 파싱 전략(CSS 선택자 vs XPath vs AI 기반)을 비교할 때
- MV3 → 다른 규격 마이그레이션 실험

---

## 설계 의사결정 플로우

```
이 규칙이 매번 반드시 실행되어야 하는가?
├── 예 → Hook
│   예시: 토큰 하드코딩 차단, manifest 보호, TS 빌드 검증
│
└── 아니오
    │
    특정 도메인 전문성이 필요한가?
    ├── 예 → Skill
    │   예시: MV3 규칙, DOM 파서 리뷰, 보안 검토
    │
    └── 아니오
        │
        메인 컨텍스트를 보호해야 하는가?
        ├── 예 → Subagent
        │   예시: 다수 쇼핑몰 병렬 커버리지 테스트
        │
        └── 아니오 → 메인 세션에서 직접 처리
```

---

## 실전 체크리스트

### Hook
- [ ] 보안 게이트(토큰 하드코딩, 위험 삭제)에 `exit 2` 사용 (`exit 1` 금지)
- [ ] 실행 시간 2초 이내 — TypeScript 검사는 수정된 파일 경로 필터링 적용
- [ ] `background/service-worker.ts` 수정 시 DOM API 접근 감지 Hook 추가
- [ ] 서브에이전트에도 재귀 적용되는지 확인

### Skill
- [ ] Description이 실제 발동 시나리오를 명확히 기술
- [ ] allowed-tools를 `Read, Grep` �� 최소 도구로 제한
- [ ] Skill 총 4개 이내 유지 (컨텍스트 예산 준수)
- [ ] 새 쇼핑몰 추가 플로우에서 DOM 파서 Skill이 실제로 활성화되는지 테스트

### Subagent
- [ ] 쇼핑몰 커버리지 테스트는 Haiku 모델로 병렬 실행 (비용 절감)
- [ ] 파서 알고리즘 실험은 Worktree 격리 후 진행
- [ ] 병렬 실행 시 각 서브에이전트가 서로의 결과를 보지 않는지 확인 (독립 평가)
