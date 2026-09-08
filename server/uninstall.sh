#!/usr/bin/env bash
launchctl bootout "gui/$(id -u)/com.ytclip.server" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.ytclip.server.plist"; echo "removed"
