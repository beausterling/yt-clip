#!/usr/bin/env bash
# One-shot setup for YT Clip on macOS: installs deps via Homebrew, starts the local server,
# and prints the two clicks needed to load the Chrome extension.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

[ "$(uname)" = "Darwin" ] || { echo "This setup script is for macOS (uses Homebrew + launchd). See README for other systems."; exit 1; }
command -v brew >/dev/null || { echo "Homebrew is required: https://brew.sh"; exit 1; }

for t in yt-dlp ffmpeg node; do
  if ! command -v "$t" >/dev/null; then echo "==> installing $t"; brew install "$t"; fi
done
echo "==> yt-dlp $(yt-dlp --version), ffmpeg $(ffmpeg -version | head -1 | cut -d' ' -f3), node $(node --version)"

echo "==> installing the local server (launchd, always on)"
"$DIR/server/install.sh"

cat <<MSG

Server is running. Last step, in Chrome:
  1. Open chrome://extensions
  2. Turn on "Developer mode" (top right)
  3. Click "Load unpacked" and choose:  $DIR/extension
  4. Open any YouTube video. The "Download / Clip" button sits under the player.

Note: the first download that needs cookies will make macOS ask for Keychain access
to "Chrome Safe Storage". Click "Always Allow" so it never asks again.
MSG
