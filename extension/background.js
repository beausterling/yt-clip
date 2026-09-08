// Proxies content-script requests to the local yt-clip server (content scripts
// can't reach localhost cross-origin; the service worker has host_permissions).
const BASE = 'http://127.0.0.1:48923';
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    try {
      const r = await fetch(BASE + msg.path, {
        method: msg.method || 'GET',
        headers: { 'content-type': 'application/json' },
        body: msg.body ? JSON.stringify(msg.body) : undefined,
      });
      reply({ ok: r.ok, status: r.status, data: await r.json() });
    } catch (e) {
      reply({ ok: false, status: 0, data: { error: 'yt-clip server is not running (run server/install.sh)' } });
    }
  })();
  return true;
});
