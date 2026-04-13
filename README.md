# Harness Dashboard

> Claude Code와 연동되는 AI 기획 자동화 대시보드.  
> PRD · 기능 목록 · 워크플로우 · 스프린트 플랜을 AI로 생성하고, 버전 관리하며, 팀과 공유합니다.

---

## 설치 (한 줄)

```bash
curl -fsSL https://raw.githubusercontent.com/JasonJunseokLee/harness-dashboard/main/install.sh | bash
```

설치 후 대시보드 시작:

```bash
cd ~/.harness-dashboard && npm run dev
```

그 다음, **아무 프로젝트에서나** Claude Code에 입력:

```
/harness
```

→ 현재 프로젝트가 대시보드에 자동 연결됩니다.

---

## 기능

| 기능 | 설명 |
|---|---|
| **온보딩** | 프로젝트 정보 · 기술 스택 입력 |
| **PRD** | AI로 제품 요구사항 문서 생성 |
| **기능 목록** | 기능 트리 구조 자동 생성 |
| **워크플로우** | 플로우차트 자동 설계 |
| **스프린트 플랜** | 스프린트 계획 생성 |
| **하네스 세팅** | CLAUDE.md · 디자인 시스템 · 하네스 템플릿 튜닝 |
| **AI 수정** | 모든 문서를 AI로 실시간 수정 · 버전 관리 |
| **Ralph Loop** | AI 자동 반복 루프 실행 |

---

## 동작 원리

```
/harness (Claude Code 커맨드)
    ↓
~/.harness-launch.json 에 현재 프로젝트 경로 기록
    ↓
localhost:3748 에서 실행 중인 대시보드가 해당 프로젝트 연결
    ↓
.harness/ 폴더에 PRD · 기능 · 워크플로우 등 저장
```

### 프로젝트 연결 우선순위

1. `HARNESS_TARGET` 환경변수
2. `~/.harness-launch.json`
3. `process.cwd()` (fallback)

---

## 커스텀 설치 경로

```bash
# 원하는 경로 지정
bash install.sh ~/my-tools/harness-dashboard

# 또는 환경변수로
HARNESS_DASHBOARD_PATH=~/my-tools/harness-dashboard bash install.sh
```

---

## 업데이트

```bash
bash install.sh  # 이미 설치된 경우 자동으로 git pull 후 재설치
```

---

## 요구사항

- Node.js 18+
- npm
- Claude Code CLI
- `claude` CLI (AI 생성 기능에 필요)

---

## 라이선스

MIT
