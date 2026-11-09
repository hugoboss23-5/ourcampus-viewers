#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Pin every publicly served byte to a commit that has already reached GitHub.
pin=$(git rev-parse "${1:-origin/main}^{commit}")
mkdir -p "$PWD/proof"
out=$(mktemp -d "$PWD/proof/worker.XXXXXXXX")
trap 'rm -rf -- "$out"' EXIT
cp deploy/cloudflare-worker.mjs "$out/index.mjs"
git show "$pin:release.sha256" | python3 -c '
import json,sys
pin=sys.argv[1]
mkdir -p "$PWD/proof"
paths=[line.strip().split("  site",1)[1] for line in sys.stdin]
paths=sorted(p for p in paths if p!="/.nojekyll")
print("export const pin = "+json.dumps(pin)+";")
print("export const paths = "+json.dumps(paths)+";")
' "$pin" > "$out/cloudflare-release.mjs"
cat > "$out/wrangler.toml" <<'TOML'
name = "ourcampus-viewers"
main = "index.mjs"
compatibility_date = "2026-11-01"
workers_dev = true
preview_urls = false
TOML
wrangler deploy --config "$out/wrangler.toml"
