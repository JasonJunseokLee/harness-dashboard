# Harness Dashboard

프로젝트 기획 대시보드를 로컬에서 실행합니다.

## 실행 방법

다음 명령어를 순서대로 실행하세요:

```bash
# 1. 의존성 설치 (최초 1회)
cd ~/CascadeProjects/harness-dashboard && npm install

# 2. 개발 서버 실행
npm run dev
```

그 후 브라우저에서 http://localhost:3000 을 열면 대시보드가 표시됩니다.

## GitHub에서 설치하는 방법

```bash
git clone https://github.com/YOUR_USERNAME/harness-dashboard ~/CascadeProjects/harness-dashboard
cd ~/CascadeProjects/harness-dashboard
npm install
npm run dev
```

## context 폴더 사용법

`context/` 폴더에 AI가 참고할 파일을 넣어두면 프롬프트 전송 시 자동으로 포함됩니다.
- 녹취록, 시장조사 자료, 경쟁사 분석 등 텍스트 파일 가능
- "context 폴더 파일 포함" 체크박스를 켜면 적용됩니다
