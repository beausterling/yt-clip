#!/usr/bin/env node
// yt-clip local server: wraps the yt-dlp fallback ladder + ffmpeg trimming.
// Zero dependencies. Binds 127.0.0.1 only. Writes finished files to ~/Downloads.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.YTCLIP_PORT || 48923);
const OUT_DIR = process.env.YTCLIP_OUT || join(homedir(), 'Downloads');
const CACHE = process.env.YTCLIP_CACHE || join(homedir(), '.cache', 'yt-clip');
const COOKIE_BROWSER = process.env.COOKIE_BROWSER || 'chrome';
const CACHE_TTL_MS = 6 * 3600e3;
mkdirSync(CACHE, { recursive: true });

const jobs = new Map(); // id -> {status, step, log, file, error}

const run = (cmd, args, job, onOut) => new Promise((resolve) => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  p.stdout.on('data', d => { out += d; (onOut || parseProgress)(String(d), job); });
  p.stderr.on('data', d => { err += d; });
  p.on('close', code => resolve({ code, out, err }));
});

// yt-dlp --newline lines look like: [download]  45.2% of  120.50MiB at    2.31MiB/s ETA 00:31
function parseProgress(s, job) {
  if (!job) return;
  for (const line of s.split('\n')) {
    const m = line.match(/\[download\]\s+([\d.]+)%(?:\s+of\s+~?\s*([\d.]+\w+))?(?:\s+at\s+([\d.]+\w+\/s))?(?:\s+ETA\s+([\d:]+))?/);
    if (!m) continue;
    job.progress = parseFloat(m[1]);
    if (m[2]) job.size = m[2];
    if (m[3]) job.speed = m[3];
    if (m[4]) job.eta = toSec(m[4]);
    job.updatedAt = Date.now();
  }
}

// ffmpeg -progress pipe:1 emits out_time_us=...; convert to percent of the expected duration.
function parseFfmpeg(s, job, totalSec) {
  if (!job || !totalSec) return;
  for (const line of s.split('\n')) {
    const m = line.match(/^out_time_us=(\d+)/);
    if (!m) continue;
    const done = Number(m[1]) / 1e6;
    job.progress = Math.min(99.9, done / totalSec * 100);
    const el = (Date.now() - job.phaseStart) / 1000;
    if (done > 0.5 && el > 0.5) { const rate = done / el; job.speed = rate.toFixed(1) + 'x'; job.eta = Math.max(0, Math.round((totalSec - done) / rate)); }
    job.updatedAt = Date.now();
  }
}

const toSec = t => { const p = String(t).split(':').map(Number); while (p.length < 3) p.unshift(0); return p[0] * 3600 + p[1] * 60 + p[2]; };
const safe = s => s.replace(/[\/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
const stamp = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + 'h' : '') + String(m).padStart(2, '0') + 'm' + String(x).padStart(2, '0') + 's'; };

function cleanCache() {
  const now = Date.now();
  for (const f of readdirSync(CACHE)) { const p = join(CACHE, f); try { if (now - statSync(p).mtimeMs > CACHE_TTL_MS) rmSync(p, { force: true }); } catch {} }
}

const cachePrefix = (id, kind, quality) => (kind === 'audio' ? 'a' : 'v' + (quality || '720')) + '_' + id;
function findCached(id, kind, quality) {
  const prefix = cachePrefix(id, kind, quality) + '.';
  return readdirSync(CACHE).filter(f => f.startsWith(prefix) && !f.endsWith('.part') && !f.endsWith('.ytdl') && !/\.f\d+\./.test(f)).map(f => join(CACHE, f))[0];
}

// The ladder from audio-extract/extract.sh, cheapest first. Cookies unlock YouTube's JS challenge.
// Each rung has a human label and a "what is happening while nothing moves" note for the UI.
// Verified 2026-09: the mweb player client + browser cookies is the one that exposes the full
// format list (opus/AAC audio-only, 1080p/1440p/2160p video) AND lets them download. The plain
// web client lists nothing and audio-only streams 403. So mweb+cookies goes first.
const QUALITIES = { '720': 720, '1080': 1080, 'best': 0 };
function ladder(kind, quality) {
  const browser = COOKIE_BROWSER[0].toUpperCase() + COOKIE_BROWSER.slice(1);
  const ck = c => ['--cookies-from-browser', COOKIE_BROWSER, '--extractor-args', `youtube:player_client=${c}`];
  const cookieNote = `signing in with your ${browser} cookies and solving YouTube's JS challenge`;
  if (kind === 'audio') {
    // Stereo first: the 384k AAC tracks YouTube offers are 5.1 surround, which a stereo mp3 would only downmix.
    const A = 'bestaudio[audio_channels<=2]/bestaudio';
    return [
      { label: 'best audio stream (mobile web client)', note: cookieNote, args: ['-f', A, ...ck('mweb')] },
      { label: 'best audio stream (web client)', note: cookieNote, args: ['-f', A, ...ck('web')] },
      { label: 'Safari/TV player fallback', note: 'retrying through the Safari and TV player clients without cookies', args: ['-f', A, '--extractor-args', 'youtube:player_client=web_safari,tv'] },
      { label: 'combined stream, last resort', note: 'pulling the combined audio+video file and stripping the video (lower audio quality)', args: ['-f', 'best', ...ck('web')] },
    ];
  }
  const h = QUALITIES[quality] ?? 720;
  const cap = h ? `[height<=${h}]` : '';
  // 720p/1080p: h264 first so the file plays anywhere (QuickTime included). YouTube's h264 stops
  // at 1080p, so "best" ranks by resolution instead and accepts vp9/av1 to reach 1440p/2160p.
  const V = h
    ? `bv*${cap}[vcodec^=avc1]+ba[ext=m4a][audio_channels<=2]/bv*${cap}[vcodec^=avc1]+ba/bv*${cap}+ba[audio_channels<=2]/bv*${cap}+ba/b${cap}/b`
    : `bv*+ba[ext=m4a][audio_channels<=2]/bv*+ba[audio_channels<=2]/bv*+ba/b`;
  const merge = ['--merge-output-format', 'mp4'];
  return [
    { label: `${h ? h + 'p' : 'best'} video (mobile web client)`, note: cookieNote, args: ['-f', V, ...merge, ...ck('mweb')] },
    { label: `${h ? h + 'p' : 'best'} video (web client)`, note: cookieNote, args: ['-f', V, ...merge, ...ck('web')] },
    { label: 'direct video stream, no cookies', note: 'asking YouTube for the video anonymously', args: ['-f', V, ...merge] },
    { label: 'combined stream, last resort', note: 'pulling the single combined file YouTube still serves (usually 360p or 720p)', args: ['-f', `b${cap}/b`, ...merge, ...ck('web')] },
  ];
}

// Remember which rung worked last time and try it first; failed rungs each cost real seconds.
const preferred = {};

async function fetchSource(job, url, id, kind, quality) {
  const cached = findCached(id, kind, quality);
  if (cached) { job.step = 'using cached download'; job.progress = 100; return cached; }
  const prefix = cachePrefix(id, kind, quality);
  const rungs = ladder(kind, quality);
  const pk = kind + ':' + (quality || ''), pref = preferred[pk] || 0;
  const order = [pref, ...rungs.map((_, i) => i).filter(i => i !== pref)];
  let n = 0;
  for (const i of order) {
    const { label, note, args } = rungs[i];
    n++;
    job.phase = 'downloading'; job.phaseStart = Date.now();
    job.step = `Step ${n} of ${rungs.length}: ${label}`;
    job.note = note;
    job.progress = 0; job.eta = null; job.speed = null; job.size = null;
    const r = await run('yt-dlp', ['--no-playlist', '--newline', ...args, '-o', join(CACHE, prefix + '.%(ext)s'), url], job);
    const got = findCached(id, kind, quality);
    if (r.code === 0 && got) { preferred[pk] = i; return got; }
    job.log.push(`step ${n} failed: yt-dlp ${args.join(' ')}\n${r.err.slice(-400)}`);
    for (const f of readdirSync(CACHE)) if (f.startsWith(prefix) && (f.endsWith('.part') || f.endsWith('.ytdl'))) rmSync(join(CACHE, f), { force: true });
  }
  throw new Error('all yt-dlp strategies failed. Try: yt-dlp --list-formats <url>');
}

async function runJob(job, { url, kind, start, end, quality }) {
  try {
    cleanCache();
    job.phase = 'info'; job.phaseStart = Date.now(); job.step = 'reading video info';
    const info = await run('yt-dlp', ['--no-warnings', '--no-playlist', '--print', '%(id)s\n%(title)s\n%(duration)s', url]);
    if (info.code !== 0) throw new Error('yt-dlp could not read this URL: ' + info.err.slice(-300));
    const [id, title, durStr] = info.out.trim().split('\n');
    const srcDur = Number(durStr) || 0;
    const clipReq = start != null && end != null;
    if (clipReq && srcDur > 15 * 60) job.hint = `Heads up: this video is ${Math.round(srcDur / 60)} min long. YouTube refuses partial downloads, so the whole file comes down first. Long videos take longer even when you only clip a small portion.`;
    else if (srcDur > 30 * 60) job.hint = `Heads up: this video is ${Math.round(srcDur / 60)} min long, so this will take a bit.`;
    const src = await fetchSource(job, url, id, kind, quality);
    const clip = start != null && end != null;
    const base = safe(title || id) + (clip ? ` [${stamp(toSec(start))}-${stamp(toSec(end))}]` : '');
    const ext = kind === 'audio' ? 'mp3' : 'mp4';
    let out = join(OUT_DIR, `${base}.${ext}`), n = 1;
    while (existsSync(out)) out = join(OUT_DIR, `${base} (${n++}).${ext}`);

    job.phase = 'encoding'; job.phaseStart = Date.now(); job.progress = 0; job.eta = null; job.speed = null; job.note = null;
    job.step = clip ? 'trimming clip' : (kind === 'audio' ? 'converting to mp3' : 'finalizing mp4');
    const expect = clip ? toSec(end) - toSec(start) : srcDur;
    // -ss before -i = fast seek; re-encode gives an exact, keyframe-independent cut.
    const seek = clip ? ['-ss', String(toSec(start)), '-t', String(toSec(end) - toSec(start))] : [];
    const enc = kind === 'audio'
      ? ['-vn', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '320k']
      : clip ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart']
             : ['-c', 'copy', '-movflags', '+faststart'];
    const r = await run('ffmpeg', ['-y', '-v', 'error', '-nostats', '-progress', 'pipe:1', ...seek, '-i', src, ...enc, out], job, (d, j) => parseFfmpeg(d, j, expect));
    if (r.code !== 0) throw new Error('ffmpeg failed: ' + r.err.slice(-400));
    job.file = out; job.status = 'done'; job.step = 'done'; job.phase = 'done'; job.progress = 100; job.eta = 0;
    // Reveal in Finder without stealing focus.
    spawn('open', ['-R', out], { stdio: 'ignore' }).unref();
  } catch (e) {
    job.status = 'error'; job.error = e.message; job.step = 'failed';
  }
}

// Only the extension (chrome-extension:// origin) or non-browser local tools (no Origin header)
// may call this. Any web page's Origin is refused, so sites can't drive downloads via CORS.
const originOk = req => !req.headers.origin || /^chrome-extension:\/\//.test(req.headers.origin);
const hostOk = req => req.headers.host === `127.0.0.1:${PORT}` || req.headers.host === `localhost:${PORT}`;
const cors = (req, res) => {
  if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
};
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

http.createServer((req, res) => {
  if (!originOk(req) || !hostOk(req)) return json(res, 403, { error: 'forbidden origin' });
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const u = new URL(req.url, 'http://x');
  if (req.method === 'GET' && u.pathname === '/health') return json(res, 200, { ok: true, out: OUT_DIR });
  if (req.method === 'GET' && u.pathname.startsWith('/jobs/')) {
    const j = jobs.get(u.pathname.slice(6)); return j ? json(res, 200, j) : json(res, 404, { error: 'no such job' });
  }
  if (req.method === 'POST' && u.pathname === '/jobs') {
    let body = ''; req.on('data', d => body += d);
    return req.on('end', () => {
      let b; try { b = JSON.parse(body); } catch { return json(res, 400, { error: 'bad json' }); }
      if (!/^https?:\/\//.test(b.url || '')) return json(res, 400, { error: 'bad url' });
      if (!['audio', 'video'].includes(b.kind)) return json(res, 400, { error: 'kind must be audio|video' });
      if ((b.start != null) !== (b.end != null)) return json(res, 400, { error: 'start and end go together' });
      if (b.quality != null && !(b.quality in QUALITIES)) return json(res, 400, { error: 'quality must be 720|1080|best' });
      if (b.start != null && !(toSec(b.end) > toSec(b.start))) return json(res, 400, { error: 'end must be after start' });
      const id = randomUUID();
      const job = { id, status: 'running', phase: 'info', step: 'queued', note: null, hint: null, progress: 0, eta: null, speed: null, size: null, phaseStart: Date.now(), updatedAt: Date.now(), log: [], file: null, error: null };
      jobs.set(id, job);
      runJob(job, b);
      json(res, 202, { id });
    });
  }
  json(res, 404, { error: 'not found' });
}).listen(PORT, '127.0.0.1', () => console.log(`yt-clip server on http://127.0.0.1:${PORT} -> ${OUT_DIR}`));
