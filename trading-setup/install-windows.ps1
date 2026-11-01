# 클로드 주식 스킬 3종 설치 (Windows PowerShell)
#  1) 트레이딩뷰 MCP + 2) 트레이딩뷰 MCP 잭슨(모닝 브리핑)  -> 잭슨 포크 하나로 둘 다 설치됨
#  3) 클로드 트레이딩 스킬 74개 (tradermonty/claude-trading-skills)
# 사전 준비: Git, Node.js 18+, Claude Code, TradingView Desktop
# 실행: PowerShell 에서  powershell -ExecutionPolicy Bypass -File .\install-windows.ps1

$ErrorActionPreference = "Stop"
$Here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$TvDir   = Join-Path $HOME "tradingview-mcp-jackson"
$SkSrc   = Join-Path $HOME "claude-trading-skills"
$SkDest  = Join-Path $HOME ".claude\skills"

foreach ($cmd in "git","node","npm","claude") {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "$cmd 가 설치되어 있지 않습니다. 먼저 설치해 주세요." }
}

Write-Host "`n[1/3] 트레이딩뷰 MCP (잭슨 포크) 설치" -ForegroundColor Cyan
if (Test-Path $TvDir) { git -C $TvDir pull --ff-only } else { git clone https://github.com/LewisWJackson/tradingview-mcp-jackson.git $TvDir }
Push-Location $TvDir
npm install
npm link            # 터미널에서 'tv brief' 명령 사용
Pop-Location
if (-not (Test-Path (Join-Path $TvDir "rules.json"))) {
  Copy-Item (Join-Path $Here "rules.json") (Join-Path $TvDir "rules.json")
  Write-Host "  rules.json 복사 완료 -> $TvDir\rules.json (관심종목/규칙 수정하세요)"
}

Write-Host "`n[2/3] Claude Code 에 MCP 서버 등록 (모든 프로젝트에서 사용)" -ForegroundColor Cyan
$Server = Join-Path $TvDir "src\server.js"
try { claude mcp remove tradingview --scope user 2>&1 | Out-Null } catch { }
claude mcp add tradingview --scope user -- node "$Server"

Write-Host "`n[3/3] 클로드 트레이딩 스킬 74개 설치" -ForegroundColor Cyan
if (Test-Path $SkSrc) { git -C $SkSrc pull --ff-only } else { git clone --depth 1 https://github.com/tradermonty/claude-trading-skills.git $SkSrc }
New-Item -ItemType Directory -Force -Path $SkDest | Out-Null
Get-ChildItem (Join-Path $SkSrc "skills") -Directory | ForEach-Object {
  Copy-Item $_.FullName (Join-Path $SkDest $_.Name) -Recurse -Force
}
$n = (Get-ChildItem (Join-Path $SkSrc "skills") -Directory).Count
Write-Host "  스킬 $n 개 -> $SkDest"

Write-Host "`n완료! 다음 순서로 사용하세요:" -ForegroundColor Green
Write-Host "  1. TradingView 를 디버그 모드로 실행:  $TvDir\scripts\launch_tv_debug.bat"
Write-Host "  2. Claude Code 재시작 후:  'tv_health_check 로 트레이딩뷰 연결 확인해줘'"
