#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Building Arca React Native Android Release APK / AAB..."
cd "$(dirname "$0")/../apps/mobile/android"

./gradlew assembleRelease

echo "✅ Android Release Build Complete!"
