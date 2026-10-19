# Contributing

Decryptid is a Go engine (a Cryptid solver and AI player) with a static web UI
that runs the engine as WebAssembly. [CLAUDE.md](CLAUDE.md) is the best map of
the architecture and its invariants; this file covers how to work on it.

## Setup

| Need | For |
|---|---|
| Go (see `go.mod`) | everything |
| `node` | `make smoke`, `make i18n-check`, `make e2e` |
| `cd web/test && npm install && npx playwright install chromium` | `make e2e` (once) |
| `python3` | `make serve` (just a static file server) |

## The loop

```sh
go build ./... && go vet ./... && go test ./...   # engine
make serve                                        # build the wasm, serve on 127.0.0.1:8347
make smoke                                        # wasm engine under Node
make e2e                                          # the UI in a real browser (Playwright)
make i18n-check                                   # message catalogs
make check-wasm-deps                              # the web build links only Go's stdlib
```

CI (`.github/workflows/pages.yml`) runs vet, tests, `check-wasm-deps` and
`i18n-check`, then deploys `web/` to GitHub Pages. It does not run `e2e`: run
it yourself before pushing UI changes. The web UI has no build step apart from
the wasm; edit `web/` files and reload.

## Recipes

### Add or change a clue (rule)

Rules are defined in `rule/rules.go` and listed by `AllRules()`.

- Append new rules; never reorder or rename existing ones. Rule numbers and
  `rule PLAYER NAME` lines in saved games depend on the order and the names.
- Add the rule's test in `rule/rule_test.go`.
- In the web UI, rule names are turned into translated text by `ruleLabel` in
  `web/js/state.js`, which parses the engine's English name. A new name shape
  needs a new `rule.*` key in `web/locales/en.json` and a case there.

### Change what the AI does

The AI's behaviour is scored in `game/turn.go` and `game/search_score.go`, and
tuned by self-play, not by intuition:

```sh
go run . -sim 300 -players 4 -policies ai,threshold   # add -advanced=false for basic rules
```

Run a few hundred games per comparison (the standard error of a win rate is
about 0.03 at 200 games). `game/turn_test.go` and `game/advise_test.go` check
the fast counting code against brute force; keep them passing. `web/js/match.js`
mirrors the turn rules in `sim/sim.go`: change both together.

### Add a JSON API operation

1. Add a `case` in `api.Handle` (`api/api.go`) and test it in `api/api_test.go`.
2. Call it from the UI with `app.engine.call('op', {...})` (or `.latest(key, ...)`
   for requests that a newer one should supersede); see `web/js/engine.js`.
3. Add it to `web/test/smoke.mjs` if it should work in wasm.

Anything the web build imports must be standard library only
(`make check-wasm-deps`); put terminal-only code behind `//go:build !js`.

### Add a UI panel (tab)

A panel is a class with `render()`, `onHex(x, y)` and `overlay()`, created in
`web/js/app.js` (see `panels`). It reads and writes state only through
`app.store.update(fn)`, which autosaves and feeds undo/redo. Add the tab name
to `tab.*` in the catalogs and to the key checks in `web/js/keys.js` and
`web/test/i18n-check.mjs`.

### Add a language

See "Languages" in the [README](README.md). Notes for translators:

- Only keys that differ need to exist in a regional variant; `en.json` is the
  base. `make i18n-check` verifies keys and `{{placeholders}}`.
- Provide the plural forms your language uses (`_one`, `_two`, `_few`, `_many`,
  `_other`; `Intl.PluralRules` decides). Keep `{{count}}` in every form.
- Right-to-left languages work automatically: `i18n.js` sets `<html dir>` from
  the language. The board, key caps and coordinates stay left-to-right (see
  the end of `style.css`). Use logical CSS properties (`margin-inline-start`,
  `text-align: start`), never `left`/`right`.
- Don't build sentences from fragments in code. If a word's form depends on its
  neighbour (gender, case), give it its own key or reword the template.
- Never put user-visible English in JS or HTML. Use `t('key', vars)` or
  `data-i18n` attributes.

## Conventions

- gofmt; every exported identifier has a doc comment; tests use plain `testing`.
- Comments say why, not what, and match the density of the surrounding code.
- Keep the README's game-file section in sync with the `Parse` doc comment.
- A new third-party file under `web/` needs its licence next to it and an entry in
  `web/THIRD_PARTY_NOTICES.txt`. The project is MIT licensed.
- This is an unofficial fan project, not affiliated with Osprey Games. Don't add
  official artwork, rulebook text or code from the official app.
- Commit messages: a short imperative summary line, then why if it isn't obvious.
