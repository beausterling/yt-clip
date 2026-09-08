# YT Clip

A tiny Chrome extension that adds a "Download / Clip" button under any YouTube video.
Download the full audio (mp3) or video (mp4), or clip a section between two timestamps.
Files land in your Downloads folder and pop open in Finder when done.

Chrome extensions cannot run yt-dlp, so there are two parts:

- `server/` - a zero-dependency Node server on `127.0.0.1:48923` that wraps yt-dlp's
  YouTube fallback ladder and trims with ffmpeg.
- `extension/` - Manifest V3 extension. The content script injects the button; the background
  worker proxies requests to the server.

## Requirements

- macOS (the always-on server uses launchd; Linux works too, see below)
- Homebrew
- Google Chrome, signed in to YouTube (yt-dlp borrows Chrome's cookies when YouTube blocks
  anonymous downloads, which is most of the time now)

## Install with an AI agent (easiest)

Paste the prompt in [AGENT_SETUP.md](AGENT_SETUP.md) into Claude Code, Codex, Cursor or any
coding agent. It installs and verifies everything; you do the two Chrome clicks at the end.

## Install by hand (macOS, about 2 minutes)

```bash
git clone https://github.com/beausterling/yt-clip ~/yt-clip
cd ~/yt-clip
./setup.sh
```

`setup.sh` installs yt-dlp, ffmpeg and node with Homebrew if missing, installs the server as
a launchd agent (`com.ytclip.server`, starts at login, restarts if it dies), then prints the Chrome
steps:

1. Open `chrome://extensions`
2. Turn on Developer mode
3. Load unpacked, pick the `extension/` folder
4. Open a YouTube video

The first download that needs cookies triggers a macOS Keychain prompt for "Chrome Safe Storage".
Click Always Allow.

## Using it

- Full: Audio (mp3) or Video (mp4) of the whole video.
- Clip: type start and end as `m:ss` or `h:mm:ss`, or hit "now" to grab the current playback
  time, then Audio or Video.
- The card shows the step, percent, speed and a countdown. Steps 1 to 4 are yt-dlp strategies,
  cheapest first; the server remembers which one worked and starts there next time.

## Good to know

- YouTube refuses partial downloads, so clipping still downloads the whole file first. Long
  videos take longer even for a short clip. Full downloads are cached for 6 hours in
  `~/.cache/yt-clip`, so several clips from one video only download once.
- Clips are re-encoded (libx264 crf 18 / mp3 V0) so cuts are frame-accurate.
- Only the extension can talk to the server: it refuses requests from web pages and unexpected
  Host headers.
- Logs: `~/Library/Logs/yt-clip.log`. Health check: `curl localhost:48923/health`.
- Different browser for cookies: set `COOKIE_BROWSER` (chrome, brave, edge, firefox, safari) in
  the `EnvironmentVariables` of `~/Library/LaunchAgents/com.ytclip.server.plist` and re-run
  `server/install.sh`.
- After reloading the extension in `chrome://extensions`, refresh any open YouTube tabs.
- Uninstall: `./server/uninstall.sh`, then remove the extension in Chrome.

## Linux

Install `yt-dlp ffmpeg nodejs` with your package manager, run `node server/server.mjs` under a
systemd user unit (or any supervisor), and load the extension the same way. Replace the
`open -R` Finder reveal in `server.mjs` with `xdg-open` or drop it.

## Updating yt-dlp

YouTube changes often. If downloads start failing at every step, `brew upgrade yt-dlp` fixes it
nine times out of ten.

## License

MIT. For personal reference, editing and analysis. Respect the source's licensing on redistribution.
