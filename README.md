# YT Clip

A tiny Chrome extension that adds a "Download / Clip" button under any YouTube video.
Download the full audio (mp3) or video (mp4), or clip a section between two timestamps.

Chrome extensions cannot run yt-dlp, so there are two parts:

- `server/` — a zero-dependency Node server on `127.0.0.1:48923` that wraps the yt-dlp
  fallback ladder from the `audio-extract` skill and trims with ffmpeg. Files land in `~/Downloads`
  and are revealed in Finder when done.
- `extension/` — Manifest V3 extension. Content script injects the button; the background
  worker proxies requests to the server.

## Install

1. `./server/install.sh` (needs yt-dlp, ffmpeg, node on PATH). Installs a launchd agent
   `com.beau.yt-clip` so the server is always running. Log: `~/Library/Logs/yt-clip.log`.
2. Chrome > `chrome://extensions` > enable Developer mode > Load unpacked > pick `extension/`.
3. Open any YouTube video. The button is centered directly under the player.

## Notes

- Clips are re-encoded (libx264 crf 18 / mp3 V0) so cuts are frame-accurate, not keyframe-snapped.
- Full downloads are cached in `~/.cache/yt-clip` for 6 hours so several clips from one video
  only download once.
- YouTube sometimes 403s the plain download; the server walks the same ladder as extract.sh,
  ending with `--cookies-from-browser chrome`. Set `COOKIE_BROWSER` in the plist to change browsers.
- Uninstall the server with `./server/uninstall.sh`.
