/**
 * Scene probe: open the gift, let the street models download, hide the DOM
 * overlay, then screenshot a list of scroll positions.
 *
 *   node _drive2.mjs <url> <outBase> <p> [p...]
 */
import { writeFileSync } from 'node:fs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const url = process.argv[2];
const outBase = process.argv[3];
const ps = process.argv.slice(4).map(Number);

const target = await (
  await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(url), { method: 'PUT' })
).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const js = async (expr) => {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.result?.exceptionDetails)
    console.error('JS ERR', JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result?.result?.value;
};
const shot = async (name) => {
  await send('Page.bringToFront');
  await wait(1200);
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outBase}_${name}.png`, Buffer.from(s.result.data, 'base64'));
  console.log('shot', name);
};

await send('Runtime.enable');
await send('Log.enable');
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown')
    console.error('EXC', JSON.stringify(m.params.exceptionDetails).slice(0, 500));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
    console.error('LOG', m.params.entry.text.slice(0, 300));
});

for (let i = 0; i < 60; i++) {
  if (await js('!!window.__frame')) break;
  await wait(500);
}
console.log('probe', await js('!!window.__frame'));

await js(`document.querySelector('.stage')?.click(); document.body.click(); 'ok'`);
await wait(2500);
await js(`window.__frame.opened = true; window.__frame.unlocked = true; window.__frame.giftOpen = 1; 'ok'`);
await wait(1500);

// Park on the street entrance so the model queue drains (one GLB at a time).
for (const warm of [0.4, 0.52, 0.56]) {
  await js(`window.__frame.target = ${warm}; window.__frame.p = ${warm}; 'ok'`);
  await wait(6000);
}
// Wait until Kengkue's mesh is actually on the rig.
for (let i = 0; i < 40; i++) {
  const n = await js(`(() => {
    let n = 0;
    window.__scene?.traverse?.(() => {});
    return document.querySelectorAll('canvas').length;
  })()`);
  void n;
  await wait(1000);
  if (i > 14) break;
}

// Strip the DOM overlay so only the render is left.
await js(`(() => {
  const c = document.querySelector('canvas');
  if (!c) return 'no canvas';
  const keep = new Set();
  for (let n = c; n; n = n.parentElement) keep.add(n);
  for (const el of document.querySelectorAll('body *')) {
    if (!keep.has(el)) el.style.setProperty('display', 'none', 'important');
  }
  return 'stripped';
})()`);

for (const p of ps) {
  await js(`window.__frame.target = ${p}; window.__frame.p = ${p}; 'ok'`);
  await wait(9000);
  console.log('p', p, 'phase', await js('JSON.stringify(window.__frame.phase)'));
  await shot('p' + String(p).replace('.', '_'));
}
ws.close();
await fetch('http://127.0.0.1:9222/json/close/' + target.id);
process.exit(0);
