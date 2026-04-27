#!/usr/bin/env bash
# Build the Next.js dashboard and copy the static output into the Python package.
# Run this once before each PyPI release (or whenever you change the UI).
#
#   bash scripts/build_ui.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBSITE_DIR="$SCRIPT_DIR/../website"
DIST_DIR="$SCRIPT_DIR/../src/argus/ui_dist"

echo "→ Installing website deps…"
cd "$WEBSITE_DIR"
npm install --silent

echo "→ Building static export…"
npm run build

echo "→ Copying output to src/argus/ui_dist/…"
rm -rf "$DIST_DIR"
cp -r out "$DIST_DIR"

echo "✓ Done — src/argus/ui_dist/ is ready. Commit it with your release."
