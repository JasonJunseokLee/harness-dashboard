# Harness Dashboard

## 개요
AI 기반 기획 자동화 대시보드. 어느 프로젝트 디렉토리에서든 `/harness` 를 입력하면 이 대시보드가 해당 프로젝트와 연결되어 PRD·기능 목록·워크플로우·스프린트 계획을 AI로 생성하고 관리합니다.

## 기술 스택
- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- React Flow (워크플로우 시각화)

## 포트
개발 서버: `3748`

## 주요 구조
- `app/` — Next.js 페이지 및 API 라우트
- `skill/harness.md` — `/harness` Claude Code 스킬 정의
- `harness-templates/` — AI 생성용 하네스 지식베이스 (14개 파일, 커밋 포함)
- `context/` — AI 프롬프트에 포함할 사용자 참고 파일 저장소
- `design-guide.md` — 대시보드 디자인 시스템 가이드

## 데이터 저장 위치
연결된 외부 프로젝트의 `.harness/` 폴더에 저장됩니다 (`~/.harness-launch.json` 기준).
