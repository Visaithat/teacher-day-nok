/**
 * Panel probe: drive to each student's hold, shoot the card face, click it,
 * shoot the letter.
 *
 *   node _panel.mjs <url> <outBase> <p> [p...]
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
const js = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails)
    console.error('JS ERR', JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result?.result?.value;
};
const shot = async (name) => {
  await send('Page.bringToFront');
  await wait(1100);
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
    console.error('LOG', m.params.entry.text.slice(0, 260));
});

for (let i = 0; i < 60; i++) {
  if (await js('!!window.__frame')) break;
  await wait(500);
}
// Press the real gift button, then wait until it is actually gone. Forcing
// the frame flags without it leaves GiftScene mounted, and the next click
// lands on the gift burst instead of the card.
for (let i = 0; i < 40; i++) {
  const gone = await js(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /click to open/i.test(x.textContent || ''));
    if (b) { b.click(); return false; }
    return true;
  })()`);
  if (gone) break;
  await wait(500);
}
await js(`window.__frame.opened = true; window.__frame.unlocked = true; window.__frame.giftOpen = 1; 'ok'`);
await wait(3000);
console.log('gift dismissed:', await js(`!/click to open/i.test(document.body.textContent || '')`));
for (const warm of [0.4, 0.52]) {
  await js(`window.__frame.target = ${warm}; window.__frame.p = ${warm}; 'ok'`);
  await wait(5000);
}

console.log(
  'fonts loaded:',
  await js(`JSON.stringify(['Caveat','Indie Flower','Shadows Into Light','Gloria Hallelujah','Patrick Hand']
    .map((f) => f + '=' + document.fonts.check('16px "' + f + '"')))`),
);

for (const p of ps) {
  await js(`window.__frame.target = ${p}; window.__frame.p = ${p}; 'ok'`);
  await wait(7000);
  const tag = 'p' + String(p).replace('.', '_');
  console.log(
    'p',
    p,
    'name',
    await js(`document.querySelectorAll('.panel-card')[0] ? 'card ok' : 'NO CARD'`),
    'pe',
    await js(`getComputedStyle(document.querySelector('.panel-card')).pointerEvents`),
  );
  await shot(tag + '_front');
  await js(`document.querySelector('.panel-card').click(); 'clicked'`);
  await wait(1600);
  await shot(tag + '_back');
  // Turn it back over so the next stop starts face-first.
  await js(`document.querySelector('.panel-card').click(); 'clicked'`);
  await wait(1200);
}
ws.close();
await fetch('http://127.0.0.1:9222/json/close/' + target.id);
process.exit(0);
