import { writeFileSync } from 'node:fs';
const [url, out, sel] = process.argv.slice(2);
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const targets = await (await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(url), { method: 'PUT' })).json();
const ws = new WebSocket(targets.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
await new Promise(r => ws.onopen = r);
const send = (method, params = {}) => new Promise(res => {
  const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
});

const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

const deadline = Date.now() + 60000;
let ready = false;
while (Date.now() < deadline) {
  await wait(500);
  const t = await evalJs('document.title');
  if (t === 'READY') { ready = true; break; }
  if (t === 'ERROR') { console.error('page error:', await evalJs('window.__err')); break; }
}
console.log('ready:', ready);
await wait(500);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('wrote', out);
const logs = await evalJs('JSON.stringify(window.__log || [])');
if (logs) console.log('log:', logs);
ws.close();
await fetch('http://127.0.0.1:9222/json/close/' + targets.id);
process.exit(0);
