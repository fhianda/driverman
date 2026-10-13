#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "La compilation iPhone nécessite un Mac avec Xcode."
  exit 1
fi
for tool in node npm pod xcodebuild; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Dépendance absente : $tool. Installez Node.js, CocoaPods et Xcode avant de continuer."
    exit 1
  fi
done
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
npm ci
npm run build
npx cap sync ios
open ios/App/App.xcworkspace
