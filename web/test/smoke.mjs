// Smoke test for the wasm engine under Node: loads web/decryptid.wasm and
// exercises the API. Run with `make smoke`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
await import(web + 'wasm_exec.js'); // defines globalThis.Go
const go = new Go();
const { instance } = await WebAssembly.instantiate(readFileSync(web + 'decryptid.wasm'), go.importObject);
go.run(instance);

let failures = 0;
function call(req) {
  const t = performance.now();
  const resp = JSON.parse(globalThis.decryptid(JSON.stringify(req)));
  const ms = (performance.now() - t).toFixed(0);
  if (resp.error) {
    console.log(`FAIL ${req.op}: ${resp.error}`);
    failures++;
  }
  return [resp.result, ms];
}
function check(cond, msg) {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}

const text = readFileSync(web + '../examples/game.txt', 'utf8');
const [game] = call({ op: 'parse', text });
check(game.players === 3 && game.markers.length === 8, 'parse example game');
const [hexes] = call({ op: 'board', game });
check(hexes.length === 108 && hexes[0].terrain === 'forest', 'board has 108 hexes');
let [sum, ms] = call({ op: 'summary', game });
check(sum.locations.length === 1, `summary: 1 viable location (${ms} ms)`);
let [turn] = call({ op: 'adviseTurn', game, player: 1 });
check(turn.search && turn.search.x === 3 && turn.search.y === 3, 'adviseTurn: search (3,3)');

// Worst case: a fresh 5-player advanced board, before any markers.
const [big] = call({ op: 'randomSetup', players: 5, advanced: true, seed: 7 });
const [rules] = call({ op: 'rules', advanced: true });
[sum, ms] = call({ op: 'summary', game: big });
check(sum.worlds > 0, `5p summary: ${sum.worlds} worlds, ${sum.locations.length} locations (${ms} ms)`);
big.known = { 1: sum.playerRules[0][0].rule };
[turn, ms] = call({ op: 'adviseTurn', game: big, player: 1 });
check(turn.questions.length > 0, `5p adviseTurn (${ms} ms)`);
[, ms] = call({ op: 'adviseCube', game: big, player: 1 });
check(true, `5p adviseCube (${ms} ms)`);
check(rules.length === 48, 'rules');

console.log(failures ? `${failures} failure(s)` : 'all ok');
process.exit(failures ? 1 : 0);
