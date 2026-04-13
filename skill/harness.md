---
name: harness
description: 하네스 대시보드를 현재 프로젝트에 연결하고 실행 상태를 확인. PRD·기능·워크플로우·스프린트·AI 수정 등 기획 자동화 대시보드. 새 프로젝트에서 /harness 입력 시 자동으로 해당 프로젝트를 대시보드에 연결.
---

# /harness — 하네스 대시보드

> 어느 프로젝트에서든 `/harness` 를 입력하면 현재 프로젝트를 대시보드에 연결하고 실행 상태를 확인합니다.
> 대시보드 위치: `__DASHBOARD_PATH__` | 포트: **3748**

---

## 실행 절차

### Step 1 — 현재 프로젝트를 대시보드에 연결

현재 세션의 작업 디렉토리를 확인한다:
```
Bash("pwd")
```

`~/.harness-launch.json` 에 현재 프로젝트 경로를 기록한다.
대시보드가 이 파일을 읽어 대상 프로젝트를 결정한다:

Write 도구로 `~/.harness-launch.json` 을 아래 내용으로 작성한다:
```json
{
  "targetProjectPath": "<현재 pwd 결과>",
  "invokedAt": "<현재 ISO 시각>"
}
```

---

### Step 2 — 대시보드 실행 여부 확인

```
Bash("curl -s http://localhost:3748/api/status 2>/dev/null")
```

응답이 있으면 (JSON 반환) → **Step 3** 으로 이동
응답이 없으면 (빈 값 또는 오류) → **Step 4** 으로 이동

---

### Step 3 — 실행 중: 상태 표시 후 브라우저 열기

`/api/status` 응답 JSON 을 파싱하여 아래 형식으로 출력한다:

```
✅ 하네스 대시보드 실행 중
   → http://localhost:3748

📁 연결된 프로젝트: <프로젝트명 (pwd의 basename)>
   경로: <targetProjectPath>

📊 기획 진행 상황:
   온보딩    <onboarding  ? ✅ : ⬜>
   PRD       <prd         ? ✅ : ⬜>
   기능 목록 <features    ? ✅ : ⬜>
   워크플로  <workflow     ? ✅ : ⬜>
   셋업      <setup        ? ✅ : ⬜>
   스프린트  <sprintPlan   ? ✅ : ⬜>
```

그리고 브라우저를 자동으로 연다:
```
Bash("open http://localhost:3748")
```

---

### Step 4 — 미실행: 자동으로 백그라운드 시작 후 브라우저 열기

"🚀 하네스 대시보드를 시작합니다..." 를 출력한다.

아래 명령으로 대시보드를 백그라운드에서 시작한다 (run_in_background: true):
```
Bash("cd __DASHBOARD_PATH__ && npm run dev > /tmp/harness-dev.log 2>&1 &", run_in_background=true)
```

그 다음, 대시보드가 응답할 때까지 최대 30초간 기다린다:
```
Bash("for i in $(seq 1 30); do curl -s http://localhost:3748/api/status >/dev/null 2>&1 && echo ready && break || sleep 1; done")
```

"ready" 가 반환되면 → `/api/status` 를 다시 호출해 Step 3 과 동일하게 상태를 표시한다.

그리고 브라우저를 자동으로 연다:
```
Bash("open http://localhost:3748")
```

30초 내에 "ready" 가 오지 않으면 아래를 출력한다:
```
⚠️ 시작 시간이 초과되었습니다. /tmp/harness-dev.log 를 확인하세요.
Bash("tail -20 /tmp/harness-dev.log")
```

---

## 연결 원리

```
~/.harness-launch.json
  └─ targetProjectPath: "/path/to/your/project"
       ↓
harness-dashboard (localhost:3748)
  └─ project-path.ts 가 이 파일을 읽어 대상 프로젝트의 .harness/ 디렉토리 조회
```

우선순위: `HARNESS_TARGET` 환경변수 → `~/.harness-launch.json` → `process.cwd()`
