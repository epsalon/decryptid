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
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('engine-status').textContent === '', null, { timeout: 30000 });
  await page.waitForSelector('#board .hex');
  check((await page.locator('#board .hex').count()) === 108, 'board draws 108 hexes');
  check((await page.locator('.status.warn').count()) === 1, 'a fresh setup asks for structures');

  await page.click('text=Random board');
  await page.waitForSelector('.status.ok');
  check((await page.locator('#board .structure').count()) === 6, 'random board has 6 structures');
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
  check((await page.locator('[data-struct$=",black"]').count()) === 2, 'advanced mode adds black structures');
  await page.reload();
  await page.waitForSelector('#board .hex');
  check((await page.locator('[data-struct="stone,blue"] .where').textContent()) === '5,4', 'setup survives a reload');
  check((await page.locator('[data-mode="advanced"].on').count()) === 1, 'mode survives a reload');

  await page.click('text=Export…');
  const text = await page.locator('dialog textarea').inputValue();
  check(/^tiles /.test(text) && text.includes('stone  5 4 blue'), 'export produces a game file');
  await page.click('dialog button[value="close"]');

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
