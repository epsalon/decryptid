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

  // --- Advice: the UI must recommend what the CLI recommends. ---
  await page.click('[data-tab="advice"]');
  await page.waitForSelector('.rec-action');
  check((await page.textContent('.rec-action')).includes('Search 3,3'), 'solved example: advice is to search 3,3 (as the CLI says)');

  const adv4 = (await readFile(join(root, '../examples/advanced.txt'), 'utf8')) + 'rule yellow Distance 2 from Standing Stone\n';
  await page.click('[data-tab="setup"]');
  await page.click('text=Import…');
  await page.fill('dialog textarea', adv4);
  await page.click('dialog button:has-text("Load")');
  await page.click('[data-tab="advice"]');
  await page.waitForFunction(() => document.querySelector('.rec-action')?.textContent.includes('Search 2,1'), null, { timeout: 30000 });
  check(true, 'fresh 4-player game: search 2,1 at 17% (as the CLI says)');
  await page.click('.settings summary');
  await page.$eval('#search-at', (el) => { el.value = '0.5'; el.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => /Ask\s*red about 11,1/.test(document.querySelector('.rec-action')?.textContent ?? ''), null, { timeout: 30000 });
  check(true, 'with search-at 50%: ask red about 11,1 (as the CLI says)');
  check(await count('#board .badge.best', 1), 'the recommended hex is marked on the board');
  check((await page.locator('#board .badge.ask').count()) >= 1, 'other good question hexes are numbered on the board');
  await page.screenshot({ path: out + 'phone-advice.png', fullPage: true });

  // A "no" means placing a penalty cube: the panel switches to cube advice.
  await page.click('[data-answer="cube"]');
  await page.waitForSelector('[data-place]', { timeout: 30000 });
  check(await count('#board [data-x="11"][data-y="1"] .cube', 1), "red's cube is recorded on 11,1");
  const spot = await page.getAttribute('[data-place]', 'data-place');
  await page.click('[data-place]');
  const [cx, cy] = spot.split(',');
  check(await count(`#board [data-x="${cx}"][data-y="${cy}"] .cube`, 1), `placing my penalty cube on the top spot (${spot})`);
  await page.waitForSelector('[data-mode="turn"].on');
  check(true, 'after the cube, advice returns to my turn');

  // --- vs AI: a real match against three AIs. ---
  const matchState = () => page.evaluate(() => JSON.parse(localStorage.getItem('decryptid.v1')).match);
  const myPieces = () => page.$$eval('#board .cube, #board .disc', (els) => els.length);
  // placeMyCube taps hexes until one is accepted (the panel rejects hexes
  // my clue allows, or that hold a cube), like a player trying spots.
  async function placeMyCube() {
    const before = await myPieces();
    for (let i = 0; i < 108; i++) {
      await page.click(`#board [data-x="${i % 12}"][data-y="${Math.floor(i / 12)}"]`, { force: true });
      if ((await myPieces()) > before) return true;
    }
    return false;
  }
  const myMove = () => page.waitForFunction(() => /Your turn|Place a (setup|penalty) cube|wins|Game over/.test(document.querySelector('#tab-body')?.textContent ?? ''), null, { timeout: 60000 });

  await page.click('[data-tab="match"]');
  await page.click('[data-o="players"][data-v="4"]');
  await page.click('[data-o="advanced"][data-v="1"]');
  await page.click('[data-o="difficulty"][data-v="hard"]');
  await page.click('[data-o="seat"][data-v="1"]');
  await page.click('[data-act="start"]');
  await page.waitForSelector('.rec-action:has-text("setup cube")', { timeout: 30000 });
  check((await matchState()).rules.length === 4, 'a match deals four secret clues');
  await page.click('[data-tab="advice"]');
  check((await page.textContent('#tab-body')).includes('hints are off'), 'solver hints are off by default in a match');
  await page.click('[data-tab="setup"]');
  check((await page.textContent('#tab-body')).includes('locked'), 'setup is locked during a match');
  await page.click('[data-tab="match"]');

  // Two setup rounds: my cube, then the three AIs place theirs.
  check(await placeMyCube(), 'I can place my first setup cube');
  await myMove();
  check(await placeMyCube(), 'I can place my second setup cube');
  await myMove();
  check(await count('#board .cube', 8), 'everyone placed two setup cubes');

  // My turn: ask red about some hex; on a "no" I owe a penalty cube.
  await page.click('[data-action="ask"]');
  await page.click('[data-target="2"]');
  const logLen = (await matchState()).log.length;
  for (let i = 0; i < 108 && (await matchState()).log.length === logLen; i++) {
    await page.click(`#board [data-x="${i % 12}"][data-y="${Math.floor(i / 12)}"]`, { force: true });
  }
  check(/asks red about/.test((await matchState()).log[0]), 'my question is answered and logged');
  for (let guard = 0; guard < 20; guard++) {
    await myMove();
    const m = await matchState();
    if (m.phase === 'over') break;
    if (m.phase === 'penalty') { await placeMyCube(); continue; }
    // My turn again: search where the cryptid is (as if I'd deduced it).
    await page.click('[data-action="search"]');
    await page.click(`#board [data-x="${m.location.x}"][data-y="${m.location.y}"]`, { force: true });
  }
  const end = await matchState();
  check(end.phase === 'over' && end.winner > 0, `the match ends with a winner (${['', 'yellow', 'red', 'green', 'cyan'][end.winner]})`);
  check(end.log.some((l) => /^(red|green|cyan) (asks|searches)/.test(l)), 'the AIs took turns');
  check(await count('.clues li', 4), 'everyone\'s clues are revealed');
  check(await count('#board .badge.best', 1), 'the cryptid\'s hex is starred');
  await page.screenshot({ path: out + 'phone-match.png', fullPage: true });

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
