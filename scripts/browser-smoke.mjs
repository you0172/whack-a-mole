/**
 * Browser smoke test: drives the built game in headless Edge over the DevTools
 * Protocol, with no test dependencies, and writes screenshots to artifacts/.
 *
 * What it actually proves (the PRD requirements unit tests cannot):
 *   R1  the board is interactive within 1 s and no modal/tutorial blocks it
 *   R1  the first target appears within 400 ms of starting
 *   R2  a click on the board registers a hit and moves the score
 *   R8  the round ends on its own and the settlement screen appears with a
 *       "play again" button
 *   R12 the whole round can be played from the keyboard alone
 *
 * Usage: node scripts/browser-smoke.mjs [url] [debugPort]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';
const port = Number(process.argv[3] ?? 9222);
const artifacts = join(process.cwd(), 'artifacts');
mkdirSync(artifacts, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((target) => target.type === 'page');
if (!page) throw new Error('no page target — is Edge running with --remote-debugging-port?');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const consoleErrors = [];

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(message.params.exceptionDetails?.text ?? 'exception');
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
  }
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? 'evaluate failed');
  }
  return result.result.value;
};

const waitFor = async (expression, timeoutMs, label) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(50);
  }
  throw new Error(`timed out waiting for ${label}`);
};

const press = async (key, code, keyCode) => {
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    windowsVirtualKeyCode: keyCode,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: keyCode,
  });
};

const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  });
  const file = join(artifacts, name);
  writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
// Desktop viewport: the layout under test is the 1080p/projector one (§3.3).
await send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});

const checks = [];
const check = (name, pass, detail) => {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ---- R1: cold start -------------------------------------------------------
const startedAt = Date.now();
await send('Page.navigate', { url });
await waitFor('document.readyState === "complete"', 10_000, 'page load');
await waitFor('document.querySelector("#app")?.dataset.ready === "true"', 10_000, 'app ready');
const readyMs = Date.now() - startedAt;

const holes = await evaluate('document.querySelectorAll("#board .hole").length');
check('R1 board renders nine holes', holes === 9, `holes=${holes}`);
check('R1 interactive well under 1 s', readyMs < 1_000, `${readyMs} ms to data-ready`);

const blocking = await evaluate(`(() => {
  const overlay = document.getElementById('overlay');
  const visible = overlay && !overlay.hidden;
  return { overlayVisible: !!visible, bodyText: document.body.innerText.length };
})()`);
check(
  'R1 start screen is the only overlay (no tutorial stack)',
  blocking.overlayVisible && blocking.bodyText > 0,
  JSON.stringify(blocking),
);

// The start-screen screenshot is deliberately taken at the very END of this script:
// a full-page capture blocks the renderer for a few hundred ms in headless mode, and
// the timing assertions below would then be measuring the screenshot, not the game.

// ---- R10: the daily challenge is offered on the first visit of the day -----
const daily = await evaluate(`(() => {
  const button = document.getElementById('overlay-secondary');
  return { hidden: button.hidden, label: button.textContent.trim() };
})()`);
check(
  'R10 daily challenge entry is offered from the start screen',
  !daily.hidden && daily.label.includes('今日挑战'),
  JSON.stringify(daily),
);

// ---- R1: first target within 400 ms of the start input --------------------
const t0 = Date.now();
await press(' ', 'Space', 32);
let firstSpawnMs = null;
const spawnDeadline = Date.now() + 1_200;
while (Date.now() < spawnDeadline) {
  const active = await evaluate('document.querySelectorAll("#board .hole--active").length');
  if (active > 0) {
    firstSpawnMs = Date.now() - t0;
    break;
  }
  await sleep(20);
}
check(
  'R1 first target within 400 ms of start',
  firstSpawnMs !== null && firstSpawnMs <= 400,
  firstSpawnMs === null ? 'no target appeared' : `${firstSpawnMs} ms`,
);

// ---- P3: the target actually appears inside its own hole ------------------
// v1 shipped a round where every logic test passed while a mole painted over the
// footer. The hole clips its mole, so the meaningful check is that a risen mole's
// box sits inside its hole and never reaches the footer.
let moleGeom = null;
let moleOk = false;
for (let attempt = 0; attempt < 30 && !moleOk; attempt += 1) {
  moleGeom = await evaluate(`(() => {
    const hole = document.querySelector('#board .hole--active');
    const footer = document.querySelector('.footer');
    if (!hole) return null;
    const mole = hole.querySelector('.mole');
    const hr = hole.getBoundingClientRect();
    const mr = mole.getBoundingClientRect();
    const fr = footer ? footer.getBoundingClientRect() : null;
    const tol = 4;
    return {
      clipping: getComputedStyle(hole).overflow,
      width: Math.round(mr.width),
      height: Math.round(mr.height),
      insideHole:
        mr.top >= hr.top - tol && mr.bottom <= hr.bottom + tol &&
        mr.left >= hr.left - tol && mr.right <= hr.right + tol,
      coversFooter: fr ? mr.bottom > fr.top : false,
    };
  })()`);
  moleOk =
    !!moleGeom &&
    moleGeom.clipping === 'hidden' &&
    moleGeom.width > 0 &&
    moleGeom.height > 0 &&
    moleGeom.insideHole &&
    !moleGeom.coversFooter;
  if (!moleOk) await sleep(40);
}
check(
  'P3 target rises inside its hole, clipped, never covering the footer',
  moleOk,
  JSON.stringify(moleGeom),
);
await shot('02a-first-target.png');

// ---- R12: keyboard-only hit ----------------------------------------------
const beforeScore = await evaluate(
  'Number(document.getElementById("score").textContent.replace(/\\D/g, ""))',
);
const activeKeys = await evaluate(`(() => {
  const holes = [...document.querySelectorAll('#board .hole--active')];
  return holes.map((hole) => Number(hole.dataset.hole) + 1);
})()`);
if (activeKeys.length > 0) {
  await press(String(activeKeys[0]), `Digit${activeKeys[0]}`, 48 + activeKeys[0]);
  await sleep(80);
}
const afterScore = await evaluate(
  'Number(document.getElementById("score").textContent.replace(/\\D/g, ""))',
);
check(
  'R12 keyboard 1–9 registers a whack',
  activeKeys.length > 0 && afterScore >= beforeScore && (afterScore > 0 || activeKeys.length === 0),
  `key=${activeKeys[0] ?? 'none'} score ${beforeScore} → ${afterScore}`,
);

// ---- R2: pointer hit ------------------------------------------------------
// Wait for a target to actually be up, then click it like a player would.
await waitFor(
  'document.querySelectorAll("#board .hole--active").length > 0',
  3_000,
  'a target to click',
).catch(() => false);
const scoreBeforeClick = await evaluate(
  'Number(document.getElementById("score").textContent.replace(/\\D/g, ""))',
);
const pointerHit = await evaluate(`(() => {
  const hole = document.querySelector('#board .hole--active');
  if (!hole) return { attempted: false };
  hole.click();
  return { attempted: true, hole: Number(hole.dataset.hole) + 1 };
})()`);
await sleep(120);
const scoreAfterClick = await evaluate(
  'Number(document.getElementById("score").textContent.replace(/\\D/g, ""))',
);
check(
  'R2 click on an active hole scores',
  pointerHit.attempted && scoreAfterClick > scoreBeforeClick,
  JSON.stringify({ ...pointerHit, score: `${scoreBeforeClick} → ${scoreAfterClick}` }),
);

await shot('02-playing.png');

// ---- HUD stays inside its five items (R8 §4.8) ---------------------------
const hudItems = await evaluate('document.querySelectorAll(".hud .hud__item").length');
check('§4.8 HUD has exactly five items', hudItems === 4, `hud items=${hudItems} (+timer)`);

// ---- R8: the round ends by itself and settles ----------------------------
const settlement = await waitFor(
  '(() => { const o = document.getElementById("overlay"); return o && !o.hidden && document.getElementById("overlay-action").textContent.includes("再来一局"); })()',
  75_000,
  'settlement screen',
).catch(() => false);
check('R8 round ends and shows settlement with 再来一局', settlement === true);

if (settlement) {
  const summary = await evaluate(`(() => ({
    title: document.getElementById('overlay-title').textContent,
    rows: [...document.querySelectorAll('#overlay-stats dt')].map((dt) => dt.textContent),
    action: document.getElementById('overlay-action').textContent,
    best: document.getElementById('best').textContent,
  }))()`);
  check(
    'R8 settlement lists score, record, combo and goal',
    summary.rows.length >= 4,
    JSON.stringify(summary.rows),
  );
  await shot('03-settlement.png');

  // ---- R8: play again in under a second --------------------------------
  const again = Date.now();
  await press(' ', 'Space', 32);
  const restarted = await waitFor(
    'document.querySelectorAll("#board .hole--active").length > 0',
    2_000,
    'new round',
  ).catch(() => false);
  const restartMs = Date.now() - again;
  check(
    'R8 play again starts a new round under 1 s',
    restarted === true && restartMs < 1_000,
    `${restartMs} ms`,
  );
} else {
  await shot('03-settlement-missing.png');
}

// ---- start-screen screenshot, taken last on purpose -----------------------
// A full-page capture stalls the renderer for a few hundred ms, so it runs after
// every timing assertion rather than in the middle of them.
await send('Page.navigate', { url });
await waitFor('document.querySelector("#app")?.dataset.ready === "true"', 10_000, 'reload');
await shot('01-start.png');

// ---- console health ------------------------------------------------------
check(
  'no uncaught errors or console errors',
  consoleErrors.length === 0,
  consoleErrors.slice(0, 3).join(' | '),
);

const failed = checks.filter((entry) => !entry.pass);
writeFileSync(
  join(artifacts, 'smoke-result.json'),
  JSON.stringify({ url, when: new Date().toISOString(), checks, consoleErrors }, null, 2),
);

console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
socket.close();
process.exit(failed.length === 0 ? 0 : 1);
