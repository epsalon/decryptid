// End-to-end test of the web UI in headless Chromium.
// Usage: make web && (cd web/test && npm install && npx playwright install chromium && node e2e.mjs)
// Screenshots go to web/test/out/.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = fileURLToPath(new URL('out/', import.meta.url));
await mkdir(out, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  let path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (path.endsWith('/')) path = join(path, 'index.html');
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failures++;
};

const browser = await chromium.launch();
// count waits (up to 5 s) until selector matches n elements, so checks
// don't race the asynchronous engine and redraws.
let page;
async function count(sel, n) {
  try {
    await page.waitForFunction(([s, n]) => document.querySelectorAll(s).length === n, [sel, n], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
try {
  page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('engine-status').textContent === '', null, { timeout: 30000 });
  await page.waitForSelector('#board .hex');
  check(await count('#board .hex', 108), 'board draws 108 hexes');
  check(await count('.status.warn', 1), 'a fresh setup asks for structures');

  await page.click('text=Random board');
  await page.waitForSelector('.status.ok');
  check(await count('#board .structure', 6), 'random board has 6 structures');
  await page.screenshot({ path: out + 'phone-random.png', fullPage: true });

  // Place a structure by tapping its chip, then a hex.
  await page.click('[data-struct="stone,blue"]');
  await page.click('#board [data-x="5"][data-y="4"]', { force: true });
  check((await page.locator('[data-struct="stone,blue"] .where').textContent()) === '5,4', 'placing a structure on a tapped hex');

  // Choosing a tile already in another slot swaps the two.
  await page.selectOption('[data-slot="0,0"]', '6');
  const slots = await page.$$eval('[data-slot]', (s) => s.map((x) => x.value).join(''));
  check(new Set(slots).size === 6, `tiles stay distinct after a swap (${slots})`);

  // Advanced mode adds black structures; state survives a reload.
  await page.click('[data-mode="advanced"]');
  check(await count('[data-struct$=",black"]', 2), 'advanced mode adds black structures');
  await page.reload();
  await page.waitForSelector('#board .hex');
  check((await page.locator('[data-struct="stone,blue"] .where').textContent()) === '5,4', 'setup survives a reload');
  check(await count('[data-mode="advanced"].on', 1), 'mode survives a reload');

  await page.click('text=Export…');
  const text = await page.locator('dialog textarea').inputValue();
  check(/^tiles /.test(text) && text.includes('stone  5 4 blue'), 'export produces a game file');
  await page.click('dialog button[value="close"]');

  // --- Play: import the CLI example, whose answer the CLI knows. ---
  const example = await readFile(join(root, '../examples/game.txt'), 'utf8');
  await page.click('text=Import…');
  await page.fill('dialog textarea', example);
  await page.click('dialog button:has-text("Load")');
  await page.click('[data-tab="play"]');
  await page.waitForSelector('.status:has-text("Found it")');
  check(await count('#board .ring.viable', 1), 'example game: one viable hex, like the CLI');
  check(await count('#board [data-x="3"][data-y="3"] .ring.viable', 1), 'example game: the cryptid is at 3,3');

  // Without my clue the CLI finds 2 hexes.
  await page.click('[data-tab="me"]');
  check((await page.locator('#clue').inputValue()) === 'Distance 1 from Swamp', 'import sets my clue');
  await page.selectOption('#clue', '');
  await page.waitForFunction(() => document.querySelectorAll('#board .ring.viable').length === 2);
  check(true, 'without my clue: two viable hexes, like the CLI');
  await page.selectOption('#clue', 'Distance 1 from Swamp');

  // Placing, the cube rules, and undo/redo.
  await page.click('[data-tab="play"]');
  await page.waitForSelector('.status:has-text("Found it")');
  const before = await page.locator('#board .disc, #board .cube').count();
  await page.click('[data-tool-player="2"]');
  await page.click('[data-cube="0"]');
  await page.click('#board [data-x="0"][data-y="8"]', { force: true });
  check(await count('#board [data-x="0"][data-y="8"] .disc', 1), 'tap places a disc');
  await page.click('#board [data-x="0"][data-y="8"]', { force: true });
  check(await count('#board [data-x="0"][data-y="8"] .disc', 0), 'second tap removes it');
  await page.click('[data-act="undo"]');
  check(await count('#board [data-x="0"][data-y="8"] .disc', 1), 'undo brings it back');
  await page.click('[data-act="redo"]');
  check(await count('#board .disc, #board .cube', before), 'redo removes it again');
  // (3,5) has yellow's cube: nobody may add a piece there.
  await page.click('#board [data-x="3"][data-y="5"]', { force: true });
  await page.waitForSelector('#toast.show');
  check(await count('#board [data-x="3"][data-y="5"] .disc', 0), 'no piece on a hex with a cube');
  // A contradicting marker shows a warning: green cube on the cryptid's hex would leave no world.
  await page.click('[data-tool-player="1"]');
  await page.click('[data-cube="1"]');
  await page.click('#board [data-x="3"][data-y="3"]', { force: true });
  await page.waitForSelector('.status.warn');
  check(true, 'a contradicting marker shows a warning');
  await page.click('[data-act="undo"]');
  await page.waitForSelector('.status:has-text("Found it")');
  await page.screenshot({ path: out + 'phone-play.png', fullPage: true });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.check('#coords');
  await page.screenshot({ path: out + 'desktop.png' });
  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join('; ') : ''}`);
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `${failures} failure(s)` : 'all ok');
process.exit(failures ? 1 : 0);
