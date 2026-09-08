// YT Clip content script: a button centered under the player that downloads
// full audio/video or a clip between two timestamps via the local server.
(() => {
  const ROOT_ID = 'ytclip-root';
  const api = (path, method, body) => new Promise(res => chrome.runtime.sendMessage({ path, method, body }, res));
  const video = () => document.querySelector('video.html5-main-video');
  const fmt = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const parse = t => { if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(t.trim())) return NaN;
    const p = t.trim().split(':').map(Number); while (p.length < 3) p.unshift(0); return p[0] * 3600 + p[1] * 60 + p[2]; };
  const pageUrl = () => { const id = new URLSearchParams(location.search).get('v'); return id ? `https://www.youtube.com/watch?v=${id}` : location.href; };

  function build() {
    const root = document.createElement('div');
    root.id = ROOT_ID;
    // YouTube enforces Trusted Types, so innerHTML is blocked; build the DOM by hand.
    const el = (tag, attrs = {}, kids = []) => { const n = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) k === 'text' ? n.textContent = v : k === 'hidden' ? n.hidden = v : n.setAttribute(k, v);
      kids.forEach(k => n.appendChild(k)); return n; };
    const btn = (act, text, title) => el('button', { 'data-act': act, type: 'button', text, ...(title ? { title } : {}) });
    const tin = (t, ph) => el('input', { class: 'ytclip-t', 'data-t': t, placeholder: ph, spellcheck: 'false' });
    root.append(
      el('button', { class: 'ytclip-main', type: 'button', text: 'Download / Clip' }),
      el('div', { class: 'ytclip-panel', hidden: true }, [
        el('div', { class: 'ytclip-row' }, [
          el('span', { class: 'ytclip-label', text: 'Full' }), btn('full-audio', 'Audio (mp3)'), btn('full-video', 'Video (mp4)')]),
        el('div', { class: 'ytclip-row' }, [
          el('span', { class: 'ytclip-label', text: 'Clip' }), tin('start', '0:00'), btn('set-start', 'now', 'Use current time'),
          el('span', { class: 'ytclip-dash', text: 'to' }), tin('end', '0:30'), btn('set-end', 'now', 'Use current time'),
          btn('clip-audio', 'Audio'), btn('clip-video', 'Video')]),
        el('div', { class: 'ytclip-status', hidden: true })]));
    const panel = root.querySelector('.ytclip-panel');
    const status = root.querySelector('.ytclip-status');
    const start = root.querySelector('[data-t=start]');
    const end = root.querySelector('[data-t=end]');
    const buttons = [...root.querySelectorAll('[data-act^="full"],[data-act^="clip"]')];
    const busy = b => buttons.forEach(x => x.disabled = b);
    const say = (msg, cls = '') => { status.hidden = false; status.textContent = msg; status.className = 'ytclip-status ' + cls; };

    root.querySelector('.ytclip-main').onclick = () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden && !start.value) { const v = video(); if (v) { start.value = fmt(v.currentTime); end.value = fmt(Math.min(v.duration || 1e9, v.currentTime + 30)); } }
    };
    // Stop YouTube's keyboard shortcuts from firing while typing timestamps.
    [start, end].forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));

    async function submit(kind, clip) {
      const body = { url: pageUrl(), kind };
      if (clip) {
        const s = parse(start.value), e = parse(end.value);
        if (isNaN(s) || isNaN(e)) return say('Use m:ss or h:mm:ss timestamps.', 'err');
        if (e <= s) return say('End must be after start.', 'err');
        body.start = s; body.end = e;
      }
      busy(true); say('Starting...');
      const r = await api('/jobs', 'POST', body);
      if (!r.ok) { busy(false); return say(r.data.error || 'Request failed.', 'err'); }
      const id = r.data.id;
      const poll = async () => {
        const j = await api(`/jobs/${id}`);
        if (!j.ok) { busy(false); return say(j.data.error || 'Lost the job.', 'err'); }
        const d = j.data;
        if (d.status === 'done') { busy(false); return say('Saved to Downloads: ' + d.file.split('/').pop(), 'ok'); }
        if (d.status === 'error') { busy(false); return say(d.error, 'err'); }
        say(d.step + (d.progress ? ` ${d.progress.toFixed(0)}%` : '') + '...');
        setTimeout(poll, 700);
      };
      poll();
    }

    root.addEventListener('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
      const v = video();
      if (act === 'set-start' && v) start.value = fmt(v.currentTime);
      else if (act === 'set-end' && v) end.value = fmt(v.currentTime);
      else if (act === 'full-audio') submit('audio', false);
      else if (act === 'full-video') submit('video', false);
      else if (act === 'clip-audio') submit('audio', true);
      else if (act === 'clip-video') submit('video', true);
    });
    return root;
  }

  function mount() {
    if (!location.pathname.startsWith('/watch')) { document.getElementById(ROOT_ID)?.remove(); return; }
    const below = document.querySelector('ytd-watch-flexy #below');
    if (!below) return;
    let root = document.getElementById(ROOT_ID);
    if (root && root.parentElement === below && below.firstElementChild === root) return;
    root?.remove();
    below.prepend(build());
  }

  // YouTube mutates the DOM constantly, so a debounced MutationObserver never settles.
  // A cheap 1s poll (one querySelector) plus the SPA navigation event is reliable.
  document.addEventListener('yt-navigate-finish', () => { document.getElementById(ROOT_ID)?.remove(); mount(); });
  setInterval(mount, 1000);
  mount();
})();
