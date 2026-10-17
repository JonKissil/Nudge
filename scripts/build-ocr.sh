#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p resources/bin
swiftc -O -module-cache-path resources/bin/.swift-module-cache native/ocr-helper/main.swift -o resources/bin/ocr-helper
