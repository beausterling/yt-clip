#!/usr/bin/env bash
launchctl bootout "gui/$(id -u)/com.beau.yt-clip" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.beau.yt-clip.plist"; echo "removed"
