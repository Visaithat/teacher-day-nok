import { writeFileSync } from 'node:fs';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const url = process.argv[2];
const outBase = process.argv[3];
const ps = process.argv.slice(4).map(Number);

const target = await (await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(url), { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) console.error('JS ERR', JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};
const shot = async (name) => {
  await send('Page.bringToFront');
  await wait(1500);
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outBase}_${name}.png`, Buffer.from(s.result.data, 'base64'));
  console.log('shot', name);
};

await send('Runtime.enable');
await send('Log.enable');
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') console.error('EXC', JSON.stringify(m.params.exceptionDetails).slice(0,400));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') console.error('LOG', m.params.entry.text.slice(0,300));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.error('CONSOLE', JSON.stringify(m.params.args).slice(0,300));
});
// wait for the probe to exist
for (let i = 0; i < 60; i++) { if (await js('!!window.__frame')) break; await wait(500); }
console.log('probe', await js('!!window.__frame'));

// open the gift, then release the scroll lock directly
await js(`document.querySelector('.stage')?.click(); 'clicked'`);
await wait(3000);
await js(`window.__frame.opened = true; window.__frame.unlocked = true; window.__frame.giftOpen = 1; 'ok'`);
await wait(1500);


for (const p of ps) {
  await js(`window.__frame.target = ${p}; window.__frame.p = ${p}; 'ok'`);
  await wait(12000);
  console.log('p', p, 'phase', await js('JSON.stringify(window.__frame.phase)'), 'camZ', await js('window.__frame.cameraZ'));
  await shot('p' + String(p).replace('.', '_'));
}
ws.close();
await fetch('http://127.0.0.1:9222/json/close/' + target.id);
process.exit(0);
