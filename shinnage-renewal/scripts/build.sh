#!/usr/bin/env sh
# src/body.html → public/index.html (완전한 HTML 문서로 감싸기)
set -e
cd "$(dirname "$0")/.."
{
  printf '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  printf '<meta property="og:title" content="SHINNAGE 신나게">\n'
  printf '<meta property="og:description" content="세상의 모든 재능이 하나의 무대로. 링크 하나로 무대에 오르고, 꽃으로 재능을 발견하세요.">\n'
  printf '<script src="config.js"></script>\n'
  sed -n '1,/<\/style>/p' src/body.html
  printf '</head>\n<body>\n'
  sed -n '/<\/style>/,$p' src/body.html | sed '1d'
  printf '</body>\n</html>\n'
} > public/index.html
echo "built public/index.html"
