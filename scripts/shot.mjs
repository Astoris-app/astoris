// CDP-Screenshot mit optionaler Temp-Session. node scripts/shot.mjs <path> <out.png> [w] [h] [sessionValue]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const path = process.argv[2] || '/';
const out = process.argv[3] || 'shot.png';
const W = Number(process.argv[4] || 1440), H = Number(process.argv[5] || 900);
const sess = process.argv[6] || '';
const PORT = 9222;

const proc = spawn('/snap/bin/chromium', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`,
  '--ignore-certificate-errors', 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map();
const cmd = (method, params = {}) => new Promise((res, rej) => {
  const id = ++idc; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});

try {
  // auf DevTools warten
  let target = null;
  for (let i = 0; i < 30; i++) {
    try { const t = await (await fetch(`http://localhost:${PORT}/json`)).json(); target = t.find(x => x.type === 'page'); if (target) break; } catch {}
    await sleep(300);
  }
  if (!target) throw new Error('kein DevTools-Target');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); } };
  await cmd('Network.enable');
  if (sess) await cmd('Network.setCookie', { name: 'astoris_session', value: sess, domain: 'localhost', path: '/', secure: true, httpOnly: true });
  await cmd('Page.enable');
  const url = path.startsWith('http') ? path : `https://localhost:5180${path}`;
  await cmd('Page.navigate', { url });
  await sleep(3500);
  const r = await cmd('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(r.data, 'base64'));
  console.log('saved', out);
} catch (e) {
  console.error('FEHLER:', e.message);
} finally {
  try { ws && ws.close(); } catch {}
  proc.kill('SIGKILL');
  process.exit(0);
}
