#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/releases"

mkdir -p "$OUT"

echo "Building extension..."
node "$ROOT/esbuild.js" --production

echo "Packaging VSIX..."
npx vsce package --out "$OUT"

echo ""
echo "Output:"
ls -lh "$OUT"/*.vsix | tail -5
