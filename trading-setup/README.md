# 클로드 주식 스킬 3가지 설치 가이드

| # | 기능 | 하는 일 | 출처 |
|---|------|---------|------|
| 01 | 트레이딩뷰 MCP | 채팅으로 차트에 선 긋기, 지표 읽기, 종목·시간봉 변경, 스크린샷, Pine Script | [tradesdontlie/tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) |
| 02 | 트레이딩뷰 MCP 잭슨 | 01의 모든 기능 + **모닝 브리핑**(`morning_brief`), **어제와 비교**(`session_save`/`session_get`), `tv brief` CLI | [LewisWJackson/tradingview-mcp-jackson](https://github.com/LewisWJackson/tradingview-mcp-jackson) |
| 03 | 클로드 트레이딩 스킬 74개 | 시장 분석, 종목 스크리닝, 매매 기록, 성과 코칭, 백테스트 등 | [tradermonty/claude-trading-skills](https://github.com/tradermonty/claude-trading-skills) (MIT) |

> 01과 02는 같은 MCP 서버입니다. 잭슨 포크가 원본 기능을 모두 포함하므로 **잭슨 포크 하나만 설치**하면 두 기능이 다 됩니다.

## ⚠️ 먼저 알아둘 점

- **반드시 내 PC에서 설치해야 합니다.** 트레이딩뷰 MCP는 PC에서 실행 중인 *TradingView 데스크톱 앱*을 디버그 포트(9222)로 제어합니다. 웹 브라우저 TradingView, claude.ai 웹/모바일 채팅에서는 동작하지 않고 **Claude Code**(CLI 또는 데스크톱 앱)가 필요합니다.
- 실시간 시세는 TradingView 유료 구독 데이터 그대로 사용합니다(유료 기능을 우회하지 않음).
- 74개 스킬 중 일부는 FMP·FINVIZ Elite·Alpaca API 키가 필요합니다. 키 없이 쓸 수 있는 스킬도 많습니다.
- 모든 출력은 참고용입니다. 투자 판단과 책임은 본인에게 있습니다.

## 사전 준비

1. [Git](https://git-scm.com/downloads)
2. [Node.js 18 이상](https://nodejs.org)
3. [Claude Code](https://code.claude.com/docs/en/getting-started)
4. [TradingView 데스크톱 앱](https://www.tradingview.com/desktop/)
5. (스킬 스크립트용) Python 3.9 이상

## 설치 (한 번만)

이 폴더(`trading-setup`)를 PC로 받은 뒤:

**Windows (PowerShell)**
```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```

**macOS / Linux**
```bash
./install-mac.sh
```

스크립트가 하는 일:
1. `~/tradingview-mcp-jackson` 에 잭슨 포크를 받고 `npm install`, `npm link` (→ `tv` 명령 생성)
2. `rules.json`(한국 주식용 예시)을 복사
3. `claude mcp add tradingview --scope user` 로 Claude Code 전체에 MCP 등록
4. 트레이딩 스킬 74개를 `~/.claude/skills/` 에 복사

## 매일 사용법

1. TradingView를 디버그 모드로 실행
   - Windows: `%USERPROFILE%\tradingview-mcp-jackson\scripts\launch_tv_debug.bat`
   - Mac: `~/tradingview-mcp-jackson/scripts/launch_tv_debug_mac.sh`
2. Claude Code 실행 후 대화로 사용

### 01. 채팅으로 선 긋기 · 지표 읽기
```
tv_health_check 로 트레이딩뷰 연결 확인해줘
삼성전자(KRX:005930) 일봉으로 바꾸고 최근 저점 두 개를 이어서 추세선 그어줘
지금 차트의 RSI, MACD, 20일선 값 읽어서 해석해줘
2x2 레이아웃으로 삼성전자·SK하이닉스·나스닥·비트코인 띄워줘
```

### 02. 모닝 브리핑 · 어제와 비교
```
morning_brief 실행해서 오늘 관심종목별 상승/하락/중립 판단해줘
브리핑 결과 session_save 로 저장해줘
session_get 으로 어제 브리핑이랑 비교해서 바뀐 종목만 알려줘
```
터미널에서 바로: `tv brief`, `tv session get`

관심종목·판단 기준·리스크 규칙은 `~/tradingview-mcp-jackson/rules.json` 에서 수정합니다.
TradingView 심볼 형식은 `거래소:코드` 입니다 (예: `KRX:005930` 삼성전자, `KRX:000660` SK하이닉스).

### 03. 트레이딩 스킬 74개 (분석 · 매매 기록 · 코칭)
스킬은 요청 내용에 맞춰 자동으로 호출됩니다. 무엇을 써야 할지 모르겠으면:
```
trading-skills-navigator 로 나한테 맞는 스킬 조합 추천해줘
```
자주 쓰는 스킬:

| 목적 | 스킬 |
|------|------|
| 차트 분석 | `technical-analyst`, `market-environment-analysis`, `sector-analyst` |
| 매매 전 점검 | `pre-trade-discipline-gate`, `position-sizer`, `drawdown-circuit-breaker` |
| 매매 기록 | `trader-memory-core` |
| 코칭/복기 | `trade-performance-coach`, `signal-postmortem`, `weekly-performance-digest` |
| 시장 국면 | `macro-regime-detector`, `market-top-detector`, `market-breadth-analyzer` |

## 문제 해결

| 증상 | 해결 |
|------|------|
| `cdp_connected: false` / `ECONNREFUSED` | TradingView를 일반 실행했음 → 완전히 종료 후 `launch_tv_debug` 스크립트로 다시 실행 |
| `tv` 명령 없음 | `~/tradingview-mcp-jackson` 에서 `npm link` |
| Claude에 tradingview 도구가 안 보임 | `claude mcp list` 로 등록 확인 후 Claude Code 재시작 |
| 스킬이 안 보임 | `~/.claude/skills/` 에 폴더가 있는지 확인 후 Claude Code 재시작 |

## 업데이트
설치 스크립트를 다시 실행하면 최신 버전으로 갱신됩니다(`rules.json` 은 유지).
