# Set up YT Clip with your AI agent

Copy everything inside the box below and paste it to your coding agent (Claude Code, Codex,
Cursor, etc.). It walks the agent through the whole install and tells it how to verify each step
instead of guessing. You only have to do the two Chrome clicks at the end yourself.

````text
I want you to install "YT Clip" on this Mac. It is a small open source Chrome extension plus a
local helper server that lets me download the full audio (mp3) or video (mp4) of any YouTube
video I am watching, or clip a section between two timestamps. Repo:
https://github.com/beausterling/yt-clip

Work through these steps in order. Verify each one with a real command before moving on, and
show me the output when something fails. Do not skip verification.

1. Confirm the environment. This must be macOS with Homebrew. Run `uname` and `brew --version`.
   If Homebrew is missing, tell me and stop; I will install it from https://brew.sh first.

2. Clone the repo to ~/yt-clip (if that folder exists already, `git pull` inside it instead):
   `git clone https://github.com/beausterling/yt-clip ~/yt-clip`

3. Read ~/yt-clip/README.md and ~/yt-clip/setup.sh so you know what the script does before
   running it. Summarize it to me in two sentences.

4. Run `~/yt-clip/setup.sh`. It installs yt-dlp, ffmpeg and node via Homebrew if they are
   missing, then installs the helper server as a launchd agent named com.ytclip.server so it
   runs at login and restarts if it dies. Homebrew installs can take a few minutes; that is normal.

5. Verify the server is alive:
   `curl -s http://127.0.0.1:48923/health`
   Expected: a JSON line containing "ok":true and my Downloads path. If it fails, read
   ~/Library/Logs/yt-clip.log, fix the cause, and re-run ~/yt-clip/server/install.sh.

6. Run one real end-to-end test from the terminal so we know yt-dlp and ffmpeg actually work on
   this machine before I touch the extension. Use YouTube's first-ever video (19 seconds):
   curl -s -X POST http://127.0.0.1:48923/jobs -H 'content-type: application/json' \
     -d '{"url":"https://www.youtube.com/watch?v=jNQXAC9IVRw","kind":"audio","start":2,"end":6}'
   It returns {"id":"..."}. Poll `curl -s http://127.0.0.1:48923/jobs/<id>` every few seconds
   until "status" is "done" or "error". On success a 4 second mp3 named
   "Me at the zoo [00m02s-00m06s].mp3" appears in ~/Downloads and Finder reveals it. Confirm
   the file exists with `ls -la ~/Downloads | grep zoo`, then delete it.
   If macOS shows a Keychain prompt for "Chrome Safe Storage" during this, tell me to click
   "Always Allow"; that is yt-dlp reading Chrome's YouTube cookies, which YouTube requires for
   most downloads now. If every step fails with 403 errors, run `brew upgrade yt-dlp` and retry
   once; YouTube changes often and a stale yt-dlp is the usual cause.

7. Tell me the exact two manual steps I need to do in Chrome, with the full path filled in:
   a. Open chrome://extensions and turn on "Developer mode" (top right).
   b. Click "Load unpacked" and select the folder ~/yt-clip/extension (give me the absolute
      path, e.g. /Users/<me>/yt-clip/extension).
   Then open any YouTube video. A "Download / Clip" button should sit centered under the player.

8. When I confirm the button is there, tell me how to use it in three lines: Full Audio / Video
   downloads the whole thing; the Clip row takes start and end as m:ss or h:mm:ss, or "now" grabs
   the current playback time; the card shows step, percent, speed and a countdown while it works.
   Also mention that clipping still downloads the whole video first because YouTube refuses
   partial downloads, so long videos take longer even for a short clip.

Rules: never paste my cookies, tokens or Keychain contents anywhere. Do not modify anything
outside ~/yt-clip, ~/Library/LaunchAgents/com.ytclip.server.plist and ~/Library/Logs/yt-clip.log.
If you hit something you cannot resolve after two attempts, stop and show me the exact error.
````

## If you do not use an agent

Follow the README. It is the same steps, just written for a human.
