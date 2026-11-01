#!/usr/bin/env bash
# 클로드 주식 스킬 3종 설치 (macOS / Linux)
# 사전 준비: git, Node.js 18+, Claude Code, TradingView Desktop
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TV_DIR="$HOME/tradingview-mcp-jackson"
SK_SRC="$HOME/claude-trading-skills"
SK_DEST="$HOME/.claude/skills"

for c in git node npm claude; do command -v "$c" >/dev/null || { echo "$c 가 설치되어 있지 않습니다."; exit 1; }; done

echo "[1/3] 트레이딩뷰 MCP (잭슨 포크) 설치"
if [ -d "$TV_DIR" ]; then git -C "$TV_DIR" pull --ff-only; else git clone https://github.com/LewisWJackson/tradingview-mcp-jackson.git "$TV_DIR"; fi
(cd "$TV_DIR" && npm install && npm link)
[ -f "$TV_DIR/rules.json" ] || cp "$HERE/rules.json" "$TV_DIR/rules.json"

echo "[2/3] Claude Code 에 MCP 서버 등록"
claude mcp remove tradingview --scope user >/dev/null 2>&1 || true
claude mcp add tradingview --scope user -- node "$TV_DIR/src/server.js"

echo "[3/3] 클로드 트레이딩 스킬 설치"
if [ -d "$SK_SRC" ]; then git -C "$SK_SRC" pull --ff-only; else git clone --depth 1 https://github.com/tradermonty/claude-trading-skills.git "$SK_SRC"; fi
mkdir -p "$SK_DEST"
cp -R "$SK_SRC"/skills/* "$SK_DEST"/
echo "  스킬 $(ls -d "$SK_SRC"/skills/*/ | wc -l | tr -d ' ') 개 -> $SK_DEST"

echo
echo "완료! TradingView 디버그 실행:"
if [ "$(uname)" = "Darwin" ]; then echo "  $TV_DIR/scripts/launch_tv_debug_mac.sh"; else echo "  $TV_DIR/scripts/launch_tv_debug_linux.sh"; fi
echo "Claude Code 재시작 후: 'tv_health_check 로 트레이딩뷰 연결 확인해줘'"
