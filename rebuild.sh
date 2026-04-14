#!/usr/bin/env bash
set -e

rm -rf dist/
npm unlink rest-tui 2>/dev/null || true
npm run build
chmod +x dist/main.js
npm link
