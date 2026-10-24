// Checks the message catalogs (web/locales/*.json) against the code:
//  - every key the UI uses exists in en.json (the base catalog);
//  - every other catalog only has keys that exist in en.json;
//  - translations keep exactly the placeholders of the base string.
// Run with `node web/test/i18n-check.mjs` (also in CI).
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const flat = (node, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'object') flat(v, `${prefix}${k}.`, out);
    else out[prefix + k] = v;
  }
  return out;
};
const base = flat(JSON.parse(readFileSync(web + 'locales/en.json', 'utf8')));
const has = (key) => [key, `${key}_other`, `${key}_ordinal_other`].some((k) => k in base);
const placeholders = (s) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join(',');

let failures = 0;
const fail = (msg) => {
  console.log('FAIL', msg);
  failures++;
};

// Keys used in the code. Static ones are checked directly; dynamic ones
// (`terrain.${name}`) by listing the values they take.
const code = readdirSync(web + 'js').map((f) => readFileSync(web + 'js/' + f, 'utf8')).join('\n');
for (const [, key] of code.matchAll(/\bt\('([\w.]+)'/g)) if (!has(key)) fail(`missing key ${key}`);
for (const [, a, b] of code.matchAll(/\bt\(\w+ \? '([\w.]+)' : '([\w.]+)'/g)) for (const key of [a, b]) if (!has(key)) fail(`missing key ${key}`);
for (const [, a, b] of code.matchAll(/\bt\([\w.]+ \? '([\w.]+)' : '([\w.]+)'/g)) for (const key of [a, b]) if (!has(key)) fail(`missing key ${key}`);
for (const [, key] of code.matchAll(/(?:head|row)\([^)]*'(keys\.\w+)'\)/g)) if (!has(key)) fail(`missing key ${key}`);
const families = {
  terrain: ['forest', 'swamp', 'mountain', 'desert', 'water'],
  animal: ['bear', 'cougar'],
  structureColor: ['white', 'blue', 'green', 'black'],
  'structure.stone': ['short', 'name'],
  'structure.shed': ['short', 'name'],
  'match.level': ['easy', 'normal', 'hard'],
  'match.levelHint': ['easy', 'normal', 'hard'],
  tab: ['setup', 'me', 'play', 'advice', 'match'],
};
for (const [prefix, names] of Object.entries(families)) for (const n of names) if (!has(`${prefix}.${n}`)) fail(`missing key ${prefix}.${n}`);
for (const [, a, b] of code.matchAll(/\{ k: (?:[^,}]*\? )?'(\w+)'(?: : '(\w+)')?/g)) {
  for (const k of [a, b].filter(Boolean)) if (!has(`match.log.${k}`)) fail(`missing key match.log.${k}`);
}

// Other catalogs: known keys, same placeholders.
for (const file of readdirSync(web + 'locales').filter((f) => f !== 'en.json')) {
  const cat = flat(JSON.parse(readFileSync(web + 'locales/' + file, 'utf8')));
  for (const [k, v] of Object.entries(cat)) {
    const stem = k.replace(/_(zero|one|two|few|many|other)$/, '').replace(/_ordinal$/, '');
    if (!(k in base) && !has(stem)) fail(`${file}: unknown key ${k}`);
    else if (k in base && placeholders(v) !== placeholders(base[k])) fail(`${file}: ${k} has placeholders {${placeholders(v)}}, base has {${placeholders(base[k])}}`);
  }
}
console.log(failures ? `${failures} problem(s)` : `catalogs ok (${Object.keys(base).length} base strings)`);
process.exit(failures ? 1 : 0);
