// Dev-only helper: capture a gameplay screenshot with headless Edge over CDP.
// Usage: node docs/capture.mjs <url> <out.png>
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'docs/screenshot.png';
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const profile = mkdtempSync(join(tmpdir(), 'edge-cdp-'));
const browser = spawn(
  edge,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--window-size=1100,900',
    '--remote-debugging-port=9222',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/version');
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('devtools endpoint never came up');
}

let id = 0;
function makeClient(ws) {
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  return (method, params = {}) =>
    new Promise((resolve) => {
      id += 1;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
}

try {
  const version = await waitForDevtools();
  const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = targets.find((t) => t.type === 'page') ?? targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl ?? version.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
  const send = makeClient(ws);

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1100,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await send('Page.navigate', { url });
  await sleep(1200);

  // Start the round, then let a few moles appear.
  await send('Runtime.evaluate', {
    expression: "document.getElementById('overlay-action')?.click()",
  });
  await sleep(2600);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log(`saved ${out}`);
  ws.close();
} finally {
  browser.kill();
  await sleep(800);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* the OS may still hold a handle; the temp dir is disposable */
  }
}
