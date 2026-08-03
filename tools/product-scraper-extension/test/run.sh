#!/usr/bin/env bash
# Runs the fill-engine fixture in headless Chrome and prints the report.
# No driver, no dependencies: the page auto-runs on ?auto=1 and Chrome's --dump-dom
# hands us the rendered result, which we pull out of #out.
#
#   ./test/run.sh            # exits non-zero if any check fails
#
# You can also just open test/form-fixture.html in a normal browser and click Run.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "Chrome not found at: $CHROME  (set CHROME=/path/to/chrome)"; exit 2; }

PROFILE="$(mktemp -d)"
trap 'rm -rf "$PROFILE"' EXIT

DOM="$(timeout 60 "$CHROME" --headless=new --disable-gpu --no-first-run \
  --no-default-browser-check --disable-extensions --disable-background-networking \
  --disable-sync --user-data-dir="$PROFILE" --virtual-time-budget=2000 \
  --dump-dom "file://$HERE/form-fixture.html?auto=1" 2>/dev/null)"

REPORT="$(printf '%s' "$DOM" | python3 -c '
import sys, re, html
d = sys.stdin.read()
m = re.search(r"<div id=\"out\">(.*?)</div>", d, re.S)
print(html.unescape(m.group(1)) if m else "NO REPORT — the page did not run")
')"

echo "$REPORT"
echo "$REPORT" | grep -q '^FAIL' && exit 1
echo "$REPORT" | grep -q 'checks passed' || exit 1
exit 0
