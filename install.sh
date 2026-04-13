#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Harness Dashboard — 설치 스크립트
# 사용법: curl -fsSL https://raw.githubusercontent.com/JasonJunseokLee/harness-dashboard/main/install.sh | bash
# 또는:   bash install.sh [설치경로]
# ─────────────────────────────────────────────────────────────
set -e

# ── 색상 출력 헬퍼 ──────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
err()  { echo -e "${RED}❌ $1${NC}"; exit 1; }
info() { echo -e "   $1"; }

echo ""
echo "  ██╗  ██╗ █████╗ ██████╗ ███╗   ██╗███████╗███████╗███████╗"
echo "  ██║  ██║██╔══██╗██╔══██╗████╗  ██║██╔════╝██╔════╝██╔════╝"
echo "  ███████║███████║██████╔╝██╔██╗ ██║█████╗  ███████╗███████╗"
echo "  ██╔══██║██╔══██║██╔══██╗██║╚██╗██║██╔══╝  ╚════██║╚════██║"
echo "  ██║  ██║██║  ██║██║  ██║██║ ╚████║███████╗███████║███████║"
echo "  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝╚══════╝"
echo ""
echo "  Harness Dashboard — AI 기획 자동화 대시보드"
echo "  https://github.com/JasonJunseokLee/harness-dashboard"
echo ""

# ── 설치 경로 결정 ──────────────────────────────────────────
INSTALL_DIR="${1:-${HARNESS_DASHBOARD_PATH:-$HOME/.harness-dashboard}}"
REPO_URL="https://github.com/JasonJunseokLee/harness-dashboard.git"
SKILL_DIR="$HOME/.claude/commands"
SKILL_FILE="$SKILL_DIR/harness.md"
PORT=3748

echo "📦 설치 경로: $INSTALL_DIR"
echo "🔌 포트: $PORT"
echo ""

# ── 의존성 확인 ─────────────────────────────────────────────
command -v git  >/dev/null 2>&1 || err "git 이 설치되어 있지 않습니다."
command -v node >/dev/null 2>&1 || err "Node.js 가 설치되어 있지 않습니다."
command -v npm  >/dev/null 2>&1 || err "npm 이 설치되어 있지 않습니다."

# ── 클론 또는 업데이트 ──────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  warn "이미 설치되어 있습니다. 최신 버전으로 업데이트합니다..."
  git -C "$INSTALL_DIR" pull --ff-only
  ok "업데이트 완료"
else
  echo "📥 레포지토리 클론 중..."
  git clone --depth=1 "$REPO_URL" "$INSTALL_DIR"
  ok "클론 완료"
fi

# ── npm install ─────────────────────────────────────────────
echo ""
echo "📦 패키지 설치 중... (처음엔 1~2분 소요)"
cd "$INSTALL_DIR"
npm install --silent
ok "패키지 설치 완료"

# ── Claude 스킬 설치 ────────────────────────────────────────
echo ""
echo "🛠  Claude 스킬 설치 중..."
mkdir -p "$SKILL_DIR"

# skill/harness.md 의 __DASHBOARD_PATH__ 를 실제 경로로 치환
sed "s|__DASHBOARD_PATH__|$INSTALL_DIR|g" "$INSTALL_DIR/skill/harness.md" > "$SKILL_FILE"
ok "스킬 설치 완료: $SKILL_FILE"

# ── 완료 메시지 ─────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "Harness Dashboard 설치 완료!"
echo ""
echo "  1️⃣  대시보드 시작:"
echo "       cd $INSTALL_DIR && npm run dev"
echo ""
echo "  2️⃣  아무 프로젝트에서 Claude Code에 입력:"
echo "       /harness"
echo ""
echo "  대시보드 주소: http://localhost:$PORT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
