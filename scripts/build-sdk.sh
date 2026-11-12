#!/usr/bin/env bash
# Recompile le SDK Anthropic en un seul module ES pour le navigateur.
#   scripts/build-sdk.sh 1.3.0
# Puis mettre à jour l'import dans js/claude.js.
set -euo pipefail
VERSION="${1:-1.3.0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm init -y >/dev/null
npm install --silent --no-audit --no-fund "@anthropic-ai/sdk@$VERSION" esbuild@0.24.2
echo "export { default } from '@anthropic-ai/sdk';" > entry.mjs
npx esbuild entry.mjs --bundle --format=esm --platform=browser --target=es2022 --minify --legal-comments=eof \
  --outfile="$ROOT/js/vendor/anthropic-sdk-$VERSION.mjs"
cp node_modules/@anthropic-ai/sdk/LICENSE "$ROOT/js/vendor/anthropic-sdk-LICENSE"
echo "OK : js/vendor/anthropic-sdk-$VERSION.mjs"
