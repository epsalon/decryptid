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
// cursorTo moves the keyboard cursor to hex (x, y): Escape hides it, the
// first arrow press shows it at (5,4), then arrows step one hex.
async function cursorTo(x, y) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowUp');
  for (let i = 0; i < Math.abs(x - 5); i++) await page.keyboard.press(x < 5 ? 'ArrowLeft' : 'ArrowRight');
  for (let i = 0; i < Math.abs(y - 4); i++) await page.keyboard.press(y < 4 ? 'ArrowUp' : 'ArrowDown');
}
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
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('engine-status').textContent === '', null, { timeout: 30000 });
  await page.waitForSelector('#board .hex');
  check(await count('#board .hex', 108), 'board draws 108 hexes');
  check(await count('.status.warn', 1), 'a fresh setup asks for structures');
  await page.click('[data-tab="me"]');
  check(await count('[data-me="0"].on', 1), 'a fresh app starts as a spectator');
  await page.click('[data-tab="advice"]');
  check((await page.textContent('#tab-body')).includes('spectator'), 'advice asks a spectator to pick a colour');
  await page.click('[data-tab="setup"]');

  await page.click('text=Random board');
  await page.waitForSelector('.status.ok');
  check(await count('#board .structure', 6), 'random board has 6 structures');
  // Colours playing: fewer than 3 is allowed while choosing, but flagged.
  for (const c of ['purple', 'cyan', 'green', 'red']) await page.click(`[data-color="${c}"]`);
  check(await count('[data-color].on', 1) && (await page.textContent('.status.warn')).includes('at least 3'), 'fewer than 3 colours is an incomplete setup');
  for (const c of ['red', 'green', 'cyan', 'purple']) await page.click(`[data-color="${c}"]`);
  check(await count('[data-color].on', 5) && await count('.status.ok', 1), 'reselecting colours makes the setup valid again');
  await page.screenshot({ path: out + 'phone-random.png', fullPage: true });

  // Place a structure by tapping its chip, then a hex.
  // (5,4) is where the rest of the test expects the blue stone; clear it first
  // if the random board put something else there.
  const occupant = await page.$$eval('[data-struct]', (cs) => cs.find((c) => c.querySelector('.where').textContent === '5,4')?.dataset.struct);
  if (occupant && occupant !== 'stone,blue') {
    await page.click(`[data-struct="${occupant}"]`);
    await page.click('#board [data-x="11"][data-y="8"]', { force: true });
  }
  await page.click('[data-struct="stone,blue"]');
  await page.click('#board [data-x="5"][data-y="4"]', { force: true });
  check((await page.locator('[data-struct="stone,blue"] .where').textContent()) === '5,4', 'placing a structure on a tapped hex');

  // Drag and drop: from a chip onto the board, within the board, and swapping.
  async function drag(from, to) {
    await page.locator(from).waitFor();
    await page.locator(to).waitFor();
    const a = await page.locator(from).boundingBox();
    const b = await page.locator(to).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
  }
  const where = (s) => page.textContent(`[data-struct="${s}"] .where`);
  const free = async () => {
    // A hex with no structure, away from blue stone's.
    for (const [x, y] of [[1, 7], [2, 7], [8, 1], [9, 1], [10, 6]]) {
      if (!(await page.locator(`#board [data-x="${x}"][data-y="${y}"] .structure`).count())) return [x, y];
    }
  };
  await page.setViewportSize({ width: 1280, height: 800 }); // board and list side by side
  let [fx, fy] = await free();
  await drag('[data-struct="shed,green"]', `#board [data-x="${fx}"][data-y="${fy}"]`);
  check((await where('shed,green')) === `${fx},${fy}`, `drag a structure from its chip onto the board (${fx},${fy})`);
  await drag(`#board [data-x="${fx}"][data-y="${fy}"]`, '#board [data-x="0"][data-y="8"]');
  check((await where('shed,green')) === '0,8', 'drag a structure to another hex on the board');
  await drag('#board [data-x="0"][data-y="8"]', '#board [data-x="5"][data-y="4"]');
  check((await where('shed,green')) === '5,4' && (await where('stone,blue')) === '0,8', 'dropping on another structure swaps the two');
  await page.click('[data-struct="stone,green"]');
  check((await page.locator('[data-struct="stone,green"].on').count()) === 1, 'a tap on a chip still selects it');
  await page.click('[data-struct="stone,green"]');
  await drag('#board [data-x="0"][data-y="8"]', '#board [data-x="5"][data-y="4"]'); // swap back: blue stone to 5,4
  // On a phone the list below the board is not a drag source (it would fight
  // with scrolling): it doesn't block touch scrolling and doesn't start a drag.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-struct="shed,white"]').scrollIntoViewIfNeeded();
  const shedBefore = await where('shed,white');
  check((await page.locator('[data-struct="shed,white"]').evaluate((e) => getComputedStyle(e).touchAction)) !== 'none', 'phone: the structure list does not block scrolling');
  const chipBox = await page.locator('[data-struct="shed,white"]').boundingBox();
  await page.mouse.move(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(chipBox.x + chipBox.width / 2 + 40, chipBox.y + chipBox.height / 2 - 40, { steps: 5 });
  check(await count('.drag-ghost', 0), 'phone: dragging from the structure list starts no drag');
  await page.mouse.up();
  await page.evaluate(() => scrollTo(0, 0));
  check((await where('shed,white')) === shedBefore, 'phone: ...and changes nothing');
  if (shedBefore !== '—') {
    // Take it off the board (dragging off), so it is in the tray.
    const [sx, sy] = shedBefore.split(',');
    await drag(`#board [data-x="${sx}"][data-y="${sy}"]`, '#tabs');
    check((await where('shed,white')) === '—' && await count('#struct-dock [data-dock="shed,white"]', 1), 'phone: dragging a placed structure off the board puts it in the tray');
  }
  // Near the top edge, a carried structure scrolls the page up: from the tray, with the board partly scrolled off.
  await page.evaluate(() => scrollTo(0, 150));
  const trayBox = await page.locator('#struct-dock [data-dock="shed,white"]').boundingBox();
  await page.mouse.move(trayBox.x + trayBox.width / 2, trayBox.y + trayBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(195, 20, { steps: 10 }); // hold near the top edge
  await page.waitForFunction(() => scrollY === 0, null, { timeout: 10000 });
  const target = await page.locator('#board [data-x="2"][data-y="7"]').boundingBox();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 5 });
  await page.mouse.up();
  const shedAt = await where('shed,white');
  check(shedAt === '2,7', `phone: auto-scroll carries a structure from the tray to the board (${shedAt})`);

  // Choosing a tile already in another slot swaps the two.
  await page.selectOption('[data-slot="0,0"]', '6');
  const slots = await page.$$eval('[data-slot]', (s) => s.map((x) => x.value).join(''));
  check(new Set(slots).size === 6, `tiles stay distinct after a swap (${slots})`);

  // Tile numbers sit on the slot's corner hex: top-left, or bottom-right when flipped.
  check(await count('#board .tile-label', 6), 'setup shows the six tile numbers');
  check((await page.locator('#board .tile-border').count()) > 0, 'setup outlines the tiles');
  // The first label in document order belongs to slot 0,0 unless that tile is flipped, so find it by its hex.
  const labelAt = () => page.$$eval('#board .tile-label', (ts) => ts.map((t) => t.closest('[data-x]')).map((g) => `${g.dataset.x},${g.dataset.y}`));
  const hexAt = (x, y) => `${x},${y}`;
  const flipped0 = await page.$eval('[data-flip="0,0"]', (b) => b.classList.contains('on'));
  check((await labelAt()).includes(hexAt(flipped0 ? 5 : 0, flipped0 ? 2 : 0)), 'tile number is on the right corner');
  const labelsBefore = (await labelAt()).join(' ');
  await page.click('[data-flip="0,0"]');
  await page.waitForFunction((b) => [...document.querySelectorAll('#board .tile-label')].map((t) => { const g = t.closest('[data-x]'); return `${g.dataset.x},${g.dataset.y}`; }).join(' ') !== b, labelsBefore);
  const now = await labelAt();
  check(now.includes(hexAt(flipped0 ? 0 : 5, flipped0 ? 0 : 2)) && !now.includes(hexAt(flipped0 ? 5 : 0, flipped0 ? 2 : 0)), 'flipping a tile moves its number to the opposite corner');
  const corner = flipped0 ? '0,0' : '5,2';
  check((await page.textContent(`#board [data-x="${corner.split(',')[0]}"][data-y="${corner.split(',')[1]}"] .tile-label`)) === (await page.inputValue('[data-slot="0,0"]')), 'the label shows the slot\'s tile number');
  // A structure on a corner hex stays visible: the number is drawn under it and moved aside.
  const covered = await page.$$eval('#board .tile-label', (ts) => ts.filter((t) => {
    const g = t.closest('.hex'); const s = g.querySelector('.structure');
    return s && t.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_PRECEDING;
  }).length);
  check(covered === 0, 'tile numbers are never drawn over a structure');
  await page.click('[data-flip="0,0"]');

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
  check(await count('#board .tile-label', 0) && await count('#board .tile-border', 0), 'tile numbers and outlines are hidden outside setup');
  check(await count('#board .hex.possible', 1) && await count('#board .hex.ruled', 107) && await count('#board .ruled-out', 107), 'example game: one possible hex, like the CLI, the rest hatched and darker');
  check(await count('#board .hex.possible[data-x="3"][data-y="3"]', 1), 'example game: the cryptid is at 3,3');
  await page.click('[data-tab="play"]');
  await page.click('#show-viable');
  await page.click('[data-tab="search"]');
  check(await count('#board .hex.possible', 1), 'search: possible hexes are highlighted even when Play hides them');
  check(await count('.search-detail', 0), 'search: nothing shown until a hex is tapped');
  await page.click('#board [data-x="3"][data-y="3"]');
  await page.waitForSelector('.search-detail .search-player');
  const detail = await page.textContent('.search-detail h4');
  check(/3,3/.test(detail) && /100%/.test(detail), `search: the example's cryptid hex holds every world (${detail.trim()})`);
  check(await count('.search-detail .search-player', 3), 'search: each player has a rule list for the hex');
  check(await count('#board g[data-x="3"][data-y="3"] .ring.select', 1) && await count('#board .ring.select', 1), 'search: the tapped hex is ringed on the board');
  await page.click('.search-detail [data-view="sets"]');
  await page.waitForSelector('.search-sets li');
  const sets = await page.$$eval('.search-sets li', (ls) => ls.map((l) => l.textContent));
  const dots = await page.$$eval('.search-sets .seat-dot', (ds) => ds.map((d) => d.textContent));
  check(sets.length >= 1 && dots.length >= 3 && /^[YRGCP]$/.test(dots.join('')[0]) && await count('.search-player', 0), `search: clue sets show letter swatches, not color names (${sets.join(' / ')})`);
  check(!/yellow|red|green|cyan|purple/i.test(await page.textContent('.search-sets')), 'search: no color names in the clue sets');
  await page.click('.search-detail [data-view="players"]');
  check(await count('.search-detail .search-player', 3), 'search: switching back shows each player again');
  await page.click('#board [data-x="0"][data-y="0"]');
  await page.waitForFunction(() => document.querySelector('.search-detail')?.textContent.includes('0,0'));
  check(await count('.search-detail .search-player', 0) && /No possible world/.test(await page.textContent('.search-detail')), 'search: a hex no world reaches says so');
  await page.click('#board [data-x="3"][data-y="3"]');
  await page.keyboard.press('6');
  check(await count('[data-tab="match"][aria-selected="true"]', 1), 'key 6 switches to vs AI (the last tab)');
  await page.keyboard.press('5');
  check(await count('[data-tab="search"][aria-selected="true"]', 1), 'key 5 switches to Search');
  await page.click('[data-tab="play"]');
  await page.click('#show-viable');

  // Without my clue the CLI finds 2 hexes.
  await page.click('[data-tab="me"]');
  check((await page.locator('#clue').inputValue()) === 'Distance 1 from Swamp', 'import sets my clue');
  await page.selectOption('#clue', '');
  await page.waitForFunction(() => document.querySelectorAll('#board .hex.possible').length === 2);
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
  // Facts are not always entered in play order: a disc may follow a cube on the same hex, but a hex holds one cube.
  await page.click('[data-cube="1"]');
  await page.click('#board [data-x="0"][data-y="8"]', { force: true });
  await page.click('[data-tool-player="3"]');
  await page.click('[data-cube="0"]');
  await page.click('#board [data-x="0"][data-y="8"]', { force: true });
  check(await count('#board [data-x="0"][data-y="8"] .cube', 1) && await count('#board [data-x="0"][data-y="8"] .disc', 1), 'a disc can be added to a cubed hex');
  await page.click('[data-cube="1"]');
  await page.click('#board [data-x="0"][data-y="8"]', { force: true });
  check((await page.textContent('#toast')).includes('Replaced the cube') && await count('#board [data-x="0"][data-y="8"] .cube', 1) && await count('#board [data-x="0"][data-y="8"] .disc', 0), 'a new cube replaces the one on a hex');
  await page.click('[data-act="undo"]');
  await page.click('[data-act="undo"]');
  await page.click('[data-act="undo"]');
  check(await count('#board .disc, #board .cube', before), 'undo clears them again');
  // Keyboard shortcuts: a colour's letter picks its cube, Shift for its disc, Space toggles.
  await page.keyboard.press('g');
  check(await count('[data-tool-player="3"].on', 1) && await count('[data-cube="1"].on', 1), 'key G picks a green cube');
  await page.keyboard.press('Shift+R');
  check(await count('[data-tool-player="2"].on', 1) && await count('[data-cube="0"].on', 1), 'Shift+R picks a red disc');
  await page.keyboard.press(' ');
  check(await count('[data-cube="1"].on', 1), 'Space switches to a cube');
  await page.keyboard.press(' ');
  await page.keyboard.press('p');
  check((await page.textContent('#toast')).includes("purple isn't playing") && await count('[data-tool-player="2"].on', 1), 'a colour that is not playing is ignored, with a note');

  // Keyboard play: digits switch tabs, arrows + Enter place on the cursor's hex.
  await page.keyboard.press('1');
  check(await count('[data-tab="setup"][aria-selected="true"]', 1), 'key 1 switches to Setup');
  await page.keyboard.press('3');
  await page.keyboard.press('Shift+R');
  await cursorTo(0, 8);
  check(await count('#board [data-x="0"][data-y="8"] ~ .cursor-ring, #board .cursor-ring', 1), 'arrows show the board cursor');
  await page.keyboard.press('Enter');
  check(await count('#board [data-x="0"][data-y="8"] .disc', 1), 'Enter places a red disc on the cursor hex');
  await page.keyboard.press('Control+z');
  check(await count('#board [data-x="0"][data-y="8"] .disc', 0), 'Ctrl+Z undoes it');
  await page.keyboard.press('?');
  check(await count('dialog.help[open]', 1), '? opens the shortcut help');
  await page.keyboard.press('Escape');
  check(await count('dialog.help', 0), 'Escape closes it');

  // (3,5) has yellow's cube: a red cube replaces it.
  await page.click('[data-cube="1"]');
  await page.click('#board [data-x="3"][data-y="5"]', { force: true });
  await page.waitForSelector('#toast.show');
  check(await count('#board [data-x="3"][data-y="5"] .cube', 1) && (await page.textContent('#toast')).includes('Replaced the cube'), 'a cube replaces the one on a cubed hex');
  await page.click('[data-act="undo"]');
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
  check((await page.locator('table.advice tbody tr').count()) >= 1 && (await page.locator('table.advice tbody tr:first-child').getAttribute('class')) === 'search', 'one ranking: the best move is the search, and the table lists moves');
  await page.click('.settings summary');
  await page.$eval('#win-value', (el) => { el.value = '1'; el.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => /Ask\s*red about 11,1/.test(document.querySelector('.rec-action')?.textContent ?? ''), null, { timeout: 30000 });
  check(true, 'with a win worth only 1 bit: ask red about 11,1 (as the CLI says)');
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

  // Markers keep their colour when another colour leaves: drop red from the
  // example game, and green's disc on 9,6 is still green.
  await page.click('[data-tab="setup"]');
  await page.click('text=Import…');
  await page.fill('dialog textarea', example);
  await page.click('dialog button:has-text("Load")');
  await page.click('[data-color="red"]');
  const fill = await page.getAttribute('#board [data-x="9"][data-y="6"] .disc', 'fill');
  check(fill === '#34a853' && await count('#board [data-x="6"][data-y="2"] .disc', 0), 'removing red removes its markers; green keeps its disc');

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
  await page.click('[data-o="color"][data-v="purple"]');
  await page.click('[data-act="start"]');
  await page.waitForSelector('.rec-action:has-text("setup cube")', { timeout: 30000 });
  check((await matchState()).rules.length === 4, 'a match deals four secret clues');
  check((await page.textContent('#tab-body')).includes('You are') && (await page.textContent('#tab-body .hint')).includes('purple'), 'in vs AI I play the colour I chose');
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
  const seat2 = await page.evaluate(() => JSON.parse(localStorage.getItem('decryptid.v1')).game.colors[1]);
  const first = (await matchState()).log[0];
  check(/^ask(Disc|Cube)$/.test(first.k) && first.j === 2, `my question to ${seat2} is answered and logged`);
  for (let guard = 0; guard < 20; guard++) {
    await myMove();
    const m = await matchState();
    if (m.phase === 'over') break;
    if (m.phase === 'penalty') { await placeMyCube(); continue; }
    // My turn again: search where the cryptid is (as if I'd deduced it), by keyboard.
    await page.keyboard.press('s');
    await cursorTo(m.location.x, m.location.y);
    await page.keyboard.press('Enter');
  }
  const end = await matchState();
  check(end.phase === 'over' && end.winner > 0, `the match ends with a winner (seat ${end.winner})`);
  check(end.log.some((e) => /^(askDisc|askCube|search)$/.test(e.k) && e.p !== end.seat), 'the AIs took turns');
  check(await count('.clues li', 4), 'everyone\'s clues are revealed');
  check(await count('#board .badge.best', 1), 'the cryptid\'s hex is starred');
  await page.screenshot({ path: out + 'phone-match.png', fullPage: true });
  // A finished match keeps its reveal across tab switches, but is dropped
  // once the setup changes (it used to crash the vs AI tab).
  await page.click('[data-tab="setup"]');
  await page.click('[data-tab="match"]');
  check(await count('.clues li', 4), 'a finished match still shows its reveal after switching tabs');
  await page.click('[data-tab="setup"]');
  await page.click('[data-color="purple"]');
  await page.click('[data-tab="match"]');
  check(await count('[data-act="start"]', 1), 'after changing the setup, vs AI offers a new match');

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.check('#coords');
  await page.screenshot({ path: out + 'desktop.png' });
  // --- Hex references: hovering a coordinate spotlights its hex. ---
  await page.click('[data-tab="setup"]');
  await page.click('[data-act="new"]').catch(() => {}); // (no-op outside a match)
  const ref = page.locator('#tab-body .hexref').first();
  if (await ref.count()) {
    const hex = await ref.getAttribute('data-hex');
    await ref.hover();
    const [hx, hy] = hex.split(',');
    check(await count('#board.spotlit', 1) && await count(`#board .hex.spot[data-x="${hx}"][data-y="${hy}"]`, 1) && await count('#board .spot-ring', 1),
      `hovering coordinate ${hex} spotlights that hex`);
    await page.mouse.move(5, 5);
    check(await count('#board.spotlit', 0), 'moving away clears the spotlight');
    // Not sticky: a key press clears a hover spotlight, and shows the cursor instead.
    await ref.hover();
    await page.keyboard.press('ArrowUp');
    check(await count('#board.spotlit', 0) && await count('#board .cursor-ring', 1), 'a key press clears a hover spotlight');
    const box = await page.locator('#board').boundingBox();
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.move(box.x + 60, box.y + 60);
    check(await count('#board .cursor-ring', 0), 'moving the mouse over the board hides the keyboard cursor');
    // Setup's coordinates are not in the Tab order (they sit inside the chips).
    check(await count('#tab-body .hexref[tabindex]', 0), 'setup coordinates are not keyboard-focusable');
    await page.mouse.move(5, 5);
    // A redraw under the mouse doesn't leave it stuck.
    await page.locator('#tab-body .hexref').first().hover();
    await page.click('[data-mode="basic"].on').catch(() => page.click('[data-mode="advanced"].on'));
    check(await count('#board.spotlit', 0), 'a redraw under the mouse clears the spotlight');
  } else {
    check(false, 'setup lists coordinates as hex references');
  }

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join('; ') : ''}`);

  // --- Language: en-GB browsers get British spelling, switchable in the footer;
  // game-file text keeps the "colors" keyword. ---
  const uk = await browser.newContext({ locale: 'en-GB', viewport: { width: 1280, height: 900 } });
  page = await uk.newPage();
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('engine-status').textContent === '', null, { timeout: 30000 });
  check((await page.textContent('#tab-body')).includes('Tap the colours that are playing'), 'en-GB browser: "colours" in the UI');
  check((await page.getAttribute('html', 'lang')) === 'en-GB', 'en-GB browser: page language is en-GB');
  await page.click('text=Random board');
  await page.waitForSelector('.status.ok');
  await page.click('text=Export…');
  check((await page.locator('dialog textarea').inputValue()).includes('\ncolors '), 'export keeps the "colors" keyword in any spelling');
  await page.click('dialog button[value="close"]');
  await page.selectOption('#language', 'en');
  check((await page.textContent('#tab-body')).includes('Tap the colors that are playing'), 'switching to English (US) changes it back');
  await page.selectOption('#language', 'he');
  check((await page.getAttribute('html', 'dir')) === 'rtl' && (await page.getAttribute('html', 'lang')) === 'he', 'Hebrew: page is right-to-left');
  check((await page.textContent('#tab-body')).includes('הקישו על הצבעים'), 'Hebrew: the UI is translated');
  // The language is the one setting shared with the validator, in both directions.
  await page.goto(url + 'validate.html');
  await page.waitForFunction(() => document.getElementById('engine-status').textContent === '', null, { timeout: 30000 });
  check((await page.getAttribute('html', 'dir')) === 'rtl' && (await page.inputValue('#language')) === 'he', 'the validator opens in the language chosen in the solver');
  await page.selectOption('#language', 'en');
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('engine-status').textContent === '', null, { timeout: 30000 });
  check((await page.getAttribute('html', 'dir')) === 'ltr' && (await page.inputValue('#language')) === 'en', 'the solver follows a language chosen in the validator');
  const validatorState = await page.evaluate(() => localStorage.getItem('decryptid.validate.v1') ?? '');
  check(!validatorState.includes('"language"') && !(await page.evaluate(() => localStorage.getItem('decryptid.v1') ?? '')).includes('"language":"en"'), 'the language is saved under its own key, not in either game state');
  await page.selectOption('#language', 'he');
  await page.selectOption('#language', 'en');
  check((await page.getAttribute('html', 'dir')) === 'ltr', 'English: back to left-to-right');
  for (const [code, word] of [['fr', 'Mise en place'], ['de', 'Aufbau'], ['es', 'Preparación']]) {
    await page.selectOption('#language', code);
    check((await page.textContent('#tabs')).includes(word) && (await page.getAttribute('html', 'lang')) === code, `${code}: the UI is translated`);
  }
  await page.selectOption('#language', 'en');
  await uk.close();

  // --- On a touch phone, touching a coordinate spotlights it; if the board is
  // scrolled away, a floating copy of it appears. ---
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page = await phone.newPage();
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('engine-status').textContent === '', null, { timeout: 30000 });
  check(!(await page.isVisible('.board-tools .hint.keys')), 'phone: keyboard hints hidden until a key is pressed');
  await page.keyboard.press('Shift');
  check(!(await page.isVisible('.board-tools .hint.keys')), 'phone: a modifier alone does not count');
  await page.keyboard.press('ArrowDown');
  check(await page.isVisible('.board-tools .hint.keys'), 'phone: hints appear once a key is used');
  await page.tap('text=Random board');
  await page.waitForSelector('.status.ok');
  const shedRef = page.locator('[data-struct="shed,green"] .hexref');
  await shedRef.scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight)); // board off screen
  const touched = await shedRef.getAttribute('data-hex');
  await shedRef.tap();
  check(await count('.board-peek', 1) && await count(`.board-peek .hex.spot[data-x="${touched.split(',')[0]}"][data-y="${touched.split(',')[1]}"]`, 1),
    `phone: touching ${touched} pops up the board with that hex spotlit`);
  check(await count('.board-peek', 0) && await count('#board.spotlit', 0), 'phone: the spotlight clears after a moment');
  await phone.close();

  // --- Setup on a phone: unplaced structures sit in a tray right under the
  // board, so they can be dragged without scrolling. ---
  const dockCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await dockCtx.newPage();
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('engine-status').textContent === '', null, { timeout: 30000 });
  await page.waitForSelector('#board .hex');
  check(await count('#struct-dock [data-dock]', 6), 'phone setup: the six unplaced structures are in the tray');
  const boardBox = await page.locator('#board').boundingBox();
  const dockBox = await page.locator('#struct-dock').boundingBox();
  check(dockBox.y >= boardBox.y + boardBox.height - 2 && dockBox.y + dockBox.height <= 844, 'phone setup: the tray is right under the board, on screen with it');
  const chipB = await page.locator('#struct-dock [data-dock]').first().boundingBox();
  const hexB = await page.locator('#board [data-x="5"][data-y="4"]').boundingBox();
  await page.mouse.move(chipB.x + chipB.width / 2, chipB.y + chipB.height / 2);
  await page.mouse.down();
  await page.mouse.move(hexB.x + hexB.width / 2, hexB.y + hexB.height / 2, { steps: 8 });
  await page.mouse.up();
  check(await count('#struct-dock [data-dock]', 5) && await count('#board [data-x="5"][data-y="4"] .structure', 1), 'phone setup: dragging from the tray places it and removes it from the tray');
  // Dragging a structure off the board takes it back off (mouse).
  const offB = await page.locator('#tabs').boundingBox();
  const placedB = await page.locator('#board [data-x="5"][data-y="4"]').boundingBox();
  await page.mouse.move(placedB.x + placedB.width / 2, placedB.y + placedB.height / 2);
  await page.mouse.down();
  await page.mouse.move(offB.x + offB.width / 2, offB.y + offB.height / 2, { steps: 8 });
  await page.mouse.up();
  check(await count('#struct-dock [data-dock]', 6) && await count('#board .has-structure', 0), 'dragging a structure off the board returns it to the tray');
  await page.click('[data-tab="play"]');
  check(await count('#struct-dock[hidden]', 1), 'the tray is only shown on the Setup tab');
  await page.click('[data-tab="setup"]');
  await page.setViewportSize({ width: 1280, height: 800 });
  check(!(await page.isVisible('#struct-dock')), 'the tray is hidden when the list is beside the board');
  // Import and export carry every known rule (the solver keeps them all).
  await page.click('[data-tab="setup"]');
  await page.click('text=Import…');
  await page.fill('dialog textarea', example + '\nrule red Distance 1 from Water\n');
  await page.click('dialog button:has-text("Load")');
  await page.click('text=Export…');
  const solverExport = await page.locator('dialog textarea').inputValue();
  await page.click('dialog button[value="close"]');
  await page.click('[data-tab="play"]');
  check(!(await page.textContent('.status')).includes('alone') && (await page.textContent('.status')).includes('with the clues entered'), 'solver: after importing known rules, the status does not say "from the markers alone"');
  check(solverExport.includes('rule yellow Distance 1 from Swamp') && solverExport.includes('rule red Distance 1 from Water'), 'solver: import and export carry every known rule');
  await dockCtx.close();

  // --- Real touch input (CDP touch events on an emulated phone): the tray,
  // structures already on the board, and dragging them off. ---
  const touchCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page = await touchCtx.newPage();
  const cdp = await touchCtx.newCDPSession(page);
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('engine-status').textContent === '', null, { timeout: 30000 });
  await page.waitForSelector('#struct-dock [data-dock]');
  const centre = async (sel) => { const r = await page.locator(sel).first().boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  const touchDrag = async (from, to) => {
    const a = await centre(from);
    const z = await centre(to);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + ((z.x - a.x) * i) / 10, y: a.y + ((z.y - a.y) * i) / 10 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await touchDrag('#struct-dock [data-dock]', '#board [data-x="5"][data-y="4"]');
  check(await count('#board [data-x="5"][data-y="4"].has-structure', 1), 'touch: dragging from the tray places a structure');
  await touchDrag('#board [data-x="5"][data-y="4"]', '#board [data-x="8"][data-y="2"]');
  check(await count('#board [data-x="8"][data-y="2"].has-structure', 1) && await count('#board [data-x="5"][data-y="4"].has-structure', 0), 'touch: dragging a structure already on the board moves it');
  await touchDrag('#board [data-x="8"][data-y="2"]', '#tabs');
  check(await count('#board .has-structure', 0) && await count('#struct-dock [data-dock]', 6), 'touch: dragging a structure off the board returns it to the tray');
  await touchCtx.close();

  // --- Clue validator (validate.html): a separate page that shares nothing
  // with the solver. Clues are entered blind and verified by entering them
  // again; a mistake or a contradiction, from clues or markers, sounds the
  // buzzer (counted by a fake AudioContext). The example game's answers are
  // known from the CLI. ---
  const val = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await val.addInitScript(() => {
    window.__buzzes = 0;
    const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, value: 0 };
    window.AudioContext = class {
      state = 'running';
      currentTime = 0;
      destination = {};
      createGain() { return { gain: { ...param }, connect: (n) => { if (n === this.destination) window.__buzzes++; return n; } }; }
      createOscillator() { return { frequency: { ...param }, setPeriodicWave() {}, connect: (n) => n, start() {}, stop() {} }; }
      createPeriodicWave() { return {}; }
    };
  });
  page = await val.newPage();
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('engine-status').textContent === '', null, { timeout: 30000 });
  check(await count('a.nav-link[href="validate.html"]', 1) && await count('[data-tab="validate"]', 0), 'the solver links to the validator, which is not a tab');
  await page.goto(url + 'validate.html');
  await page.waitForFunction(() => document.getElementById('engine-status').textContent === '', null, { timeout: 30000 });
  const buzzes = (n) => page.waitForFunction((n) => window.__buzzes === n, n, { timeout: 5000 }).then(() => true, () => false);
  const enter = async (seat, rule) => {
    await page.click(`button[data-seat="${seat}"]`);
    await page.waitForSelector('#validate-rule:not([disabled])');
    await page.selectOption('#validate-rule', rule);
    await page.click('#validate-go');
  };
  check(await count('header a.brand[href="./"] .logo', 1) && await count('header a.nav-link[href="./"]', 1), 'validator: the logo, the heading and a Solver link all lead back to the solver');
  check(await count('[data-tab="match"], [data-tab="advice"], [data-tab="play"]', 0) && await count('[data-tab]', 3), 'validator: only Setup, Markers and Clues tabs');
  await page.click('text=Import…');
  await page.fill('dialog textarea', await readFile(join(root, '../examples/game.txt'), 'utf8'));
  await page.click('dialog button:has-text("Load")');
  await page.waitForFunction(() => localStorage.getItem('decryptid.validate.v1')?.includes('stone'));
  const keys = await page.evaluate(() => [localStorage.getItem('decryptid.v1'), localStorage.getItem('decryptid.validate.v1')]);
  check(!(keys[0] ?? '').includes('stone') && keys[1].includes('stone'), 'validator: saves under its own key and never touches the solver\'s state');
  await page.click('[data-tab="markers"]');
  check(await count('.status.ok', 1) && await count('#board .disc, #board .cube', 8), 'validator: imported markers are consistent');
  check(await count('#board .hex.possible, #board .hex.ruled', 0) && !(await page.textContent('#tab-body')).includes('%'), 'validator: no highlights and no probabilities');
  await page.click('[data-tab="clues"]');
  check((await page.locator('button[data-seat="1"] .muted').textContent()) === 'set' && await count('.status.ok', 1), 'validator: a known rule in an imported file becomes that seat\'s clue');
  check(!(await page.textContent('#tab-body')).includes('Swamp'), 'validator: ...and is not shown');
  await enter(1, 'Distance 1 from Swamp'); // verifies the imported clue, quietly
  await enter(2, 'Distance 1 from Water');
  await enter(3, 'Distance 2 from Cougar territory');
  check(await count('.status.ok', 1) && (await page.textContent('#tab-body')).includes('fit the board'), 'validator: the true clues are consistent');
  check(!(await page.textContent('#tab-body')).includes('Swamp') && await count('#validate-rule', 0), 'validator: an entered clue is never shown');
  check(await buzzes(0), 'validator: no buzzer for correct clues');
  // Export carries every entered clue, and importing it restores them.
  await page.click('[data-tab="setup"]');
  await page.click('text=Export…');
  const exported = await page.locator('dialog textarea').inputValue();
  check(await buzzes(1), 'validator: exporting sounds the buzzer, to discourage peeking');
  await page.click('dialog button[value="close"]');
  check(exported.includes('rule yellow Distance 1 from Swamp') && exported.includes('rule red Distance 1 from Water') && exported.includes('rule green Distance 2 from Cougar territory'), 'validator: export includes every entered clue');
  await page.click('[data-tab="clues"]');
  await page.click('button[data-seat="2"]');
  await page.click('#validate-forget');
  check((await page.locator('button[data-seat="2"] .muted').textContent()) === 'not set', 'validator: a forgotten clue is not set');
  await page.click('[data-tab="setup"]');
  await page.click('text=Import…');
  await page.fill('dialog textarea', exported);
  await page.click('dialog button:has-text("Load")');
  await page.click('[data-tab="clues"]');
  check((await page.locator('button[data-seat="2"] .muted').textContent()) === 'set' && await count('.status.ok', 1), 'validator: importing the export restores every clue');
  await page.click('button[data-seat="2"]');
  await page.selectOption('#validate-rule', 'Distance 1 from Swamp');
  await page.click('#validate-go');
  check(await buzzes(2) && await count('#validate-rule', 1), 'validator: a wrong re-entry buzzes and stays open');
  await page.selectOption('#validate-rule', 'Distance 1 from Water');
  await page.click('#validate-go');
  check(await count('#validate-rule', 0) && await buzzes(2), 'validator: the right re-entry closes quietly');
  // A marker that contradicts yellow's clue: a cube where their rule holds.
  await page.click('[data-tab="markers"]');
  await page.click('[data-tool-player="1"]');
  await page.click('[data-cube="1"]');
  await page.click('#board [data-x="1"][data-y="1"]');
  check(await buzzes(3) && await count('.status.warn', 1), 'validator: a contradicting marker buzzes and warns');
  await page.click('[data-act="undo"]');
  check(await count('.status.ok', 1) && await buzzes(3), 'validator: undoing it is consistent again, quietly');
  await page.click('[data-tab="clues"]');
  await page.click('button[data-seat="1"]');
  await page.click('#validate-forget');
  await enter(1, 'Distance 2 from Bear territory');
  check(await buzzes(4) && await count('.status.warn', 1), 'validator: contradicting clues buzz and warn');
  await page.click('#validate-run');
  await page.waitForSelector('.status.warn');
  check(await buzzes(4), 'validator: checking again while invalid stays quiet');
  await val.close();
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `${failures} failure(s)` : 'all ok');
process.exit(failures ? 1 : 0);
