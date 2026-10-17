#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f native/ocr-helper/main.swift ]]; then
  echo "The Vision OCR helper is scheduled for M6; there is no Swift source to build yet." >&2
  exit 1
fi
mkdir -p resources/bin
swiftc -O native/ocr-helper/main.swift -o resources/bin/ocr-helper
