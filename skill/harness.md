---
name: harness
description: 하네스 대시보드를 현재 프로젝트에 연결하고 실행 상태를 확인. PRD·기능·워크플로우·스프린트·AI 수정 등 기획 자동화 대시보드. 새 프로젝트에서 /harness 입력 시 자동으로 해당 프로젝트를 대시보드에 연결.
---

# /harness — 하네스 대시보드

> 어느 프로젝트에서든 `/harness` 를 입력하면 현재 프로젝트 전용 포트로 대시보드를 연결합니다.
> 프로젝트마다 고유한 포트가 배정되어 여러 프로젝트를 동시에 열 수 있습니다.
> 대시보드 위치: `__DASHBOARD_PATH__`

---

## 실행 절차

### Step 1 — 현재 프로젝트 경로 확인

```
Bash("pwd")
```

이 값을 `PROJECT_PATH` 로 기억한다.

---

### Step 2 — 프로젝트 전용 포트 조회 / 할당

`~/.harness-ports.json` 을 읽어 이 프로젝트에 배정된 포트를 찾는다.
없으면 3748부터 순차적으로 비어있는 포트를 새로 배정하고 저장한다:

```
Bash("node -e \"\
const fs=require('fs'),h=process.env.HOME+'/.harness-ports.json';\
const r=fs.existsSync(h)?JSON.parse(fs.readFileSync(h,'utf-8')):{};\
const p='PROJECT_PATH';\
if(r[p]){console.log(r[p]);}else{\
  const used=Object.values(r);\
  let port=3748;while(used.includes(port))port++;\
  r[p]=port;fs.writeFileSync(h,JSON.stringify(r,null,2));\
  console.log(port);\
}\
\"")
```

출력된 숫자를 `PORT` 로 기억한다.

---

### Step 3 — 대시보드 실행 여부 확인

```
Bash("curl -s http://localhost:PORT/api/status 2>/dev/null")
```

응답이 있으면 (JSON 반환) → **Step 4** 으로 이동
응답이 없으면 (빈 값 또는 오류) → **Step 5** 으로 이동

---

### Step 4 — 실행 중: 상태 표시 후 브라우저 열기

`/api/status` 응답 JSON 을 파싱하여 아래 형식으로 출력한다:

```
✅ 하네스 대시보드 실행 중
   → http://localhost:PORT

📁 연결된 프로젝트: <프로젝트명 (PROJECT_PATH의 basename)>
   경로: PROJECT_PATH

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
Bash("open http://localhost:PORT")
```

---

### Step 5 — 미실행: 자동으로 백그라운드 시작 후 브라우저 열기

"🚀 하네스 대시보드를 시작합니다... (포트: PORT)" 를 출력한다.

아래 명령으로 대시보드를 백그라운드에서 시작한다 (run_in_background: true):
```
Bash("cd __DASHBOARD_PATH__ && PORT=PORT HARNESS_TARGET=PROJECT_PATH npm run dev > /tmp/harness-PORT.log 2>&1 &", run_in_background=true)
```

그 다음, 대시보드가 응답할 때까지 최대 30초간 기다린다:
```
Bash("for i in $(seq 1 30); do curl -s http://localhost:PORT/api/status >/dev/null 2>&1 && echo ready && break || sleep 1; done")
```

"ready" 가 반환되면 → `/api/status` 를 다시 호출해 Step 4 와 동일하게 상태를 표시한다.

그리고 브라우저를 자동으로 연다:
```
Bash("open http://localhost:PORT")
```

30초 내에 "ready" 가 오지 않으면 아래를 출력한다:
```
⚠️ 시작 시간이 초과되었습니다. /tmp/harness-PORT.log 를 확인하세요.
Bash("tail -20 /tmp/harness-PORT.log")
```

---

## 연결 원리

```
~/.harness-ports.json
  ├─ "/path/to/project-a": 3748
  ├─ "/path/to/project-b": 3749
  └─ "/path/to/project-c": 3750

각 포트별 독립 프로세스:
  PORT=3748 HARNESS_TARGET=/path/to/project-a npm run dev
  PORT=3749 HARNESS_TARGET=/path/to/project-b npm run dev
  PORT=3750 HARNESS_TARGET=/path/to/project-c npm run dev
       ↓
project-path.ts: HARNESS_TARGET 환경변수를 최우선으로 읽음
→ 각 인스턴스가 자신의 프로젝트 .harness/ 디렉토리를 독립적으로 조회
```

로그 파일도 포트별로 분리: `/tmp/harness-{PORT}.log`
