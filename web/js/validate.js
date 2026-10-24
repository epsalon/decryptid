// The clue validator (validate.html): check a set of clues without seeing
// them. It is a separate page with its own saved state, so nothing is shared
// with the solver: no probabilities, no advice, no highlights. Players place
// the markers, then take turns entering their clue and passing the phone;
// a clue is never shown again and is verified by entering it once more. The
// verdict says only whether the clues and markers can all be true, and a
// wrong entry or a contradiction sounds a buzzer. This is the honor system:
// the clues sit in the saved state, the page just never displays them.

import { setMarkers, undo, redo, ruleGroups, ruleLabel, seatLabel, seatName, seatColors, seatOrder, setupProblems } from './state.js';
import { tapMarker } from './play.js';
import { buzz } from './buzz.js';
import { t } from './i18n.js';
import { hasClueNumbers, clueNumberField, onClueNumber } from './cluenumbers.js';

// clueKey identifies what entered clues belong to: a different mode or
// different seats make them meaningless.
const clueKey = (game) => JSON.stringify([game.advanced, seatColors(game)]);

// validatorClues is how the validator's Setup panel exports and imports known
// rules: they are the entered clues, not part of the game. An export lists
// every clue in plain text, so it sounds the buzzer to discourage peeking.
export const validatorClues = (v) => ({
  onExport: buzz,
  get() {
    const { game } = v.app.store.state;
    return Object.fromEntries(Object.entries(v.clues()).filter(([p]) => +p <= game.players));
  },
  set(state, known) {
    state.validate = { key: clueKey(state.game), clues: { ...known } };
  },
});

// Validator holds what both panels share: the entered clues and the verdict.
// app is {store, engine, toast, rerender}.
export class Validator {
  constructor(app) {
    this.app = app;
    this.verdict = { key: '', ok: null, error: null, pending: false };
    this.loud = false; // whether the next failed verdict follows a user action
    this.rules = {}; // advanced (bool) -> rule names, once fetched
  }

  // rulesFor returns the rule names for a mode, fetching them on first use.
  rulesFor(advanced) {
    if (!(advanced in this.rules)) {
      this.rules[advanced] = null;
      this.app.engine.call('rules', { advanced }).then((r) => {
        this.rules[advanced] = r;
        this.app.rerender();
      });
    }
    return this.rules[advanced];
  }

  // clues returns the entered clues (seat -> rule name) that still apply.
  clues() {
    const { game, validate } = this.app.store.state;
    return validate.key === clueKey(game) ? validate.clues : {};
  }

  setClue(p, rule) {
    this.loud = true;
    this.app.store.update((s) => {
      if (s.validate.key !== clueKey(s.game)) s.validate = { key: clueKey(s.game), clues: {} };
      if (rule) s.validate.clues[p] = rule;
      else delete s.validate.clues[p];
    });
  }

  // request asks the engine whether the entered clues fit the markers. With
  // force it asks again even if nothing changed. The buzzer sounds when the
  // user's own action (loud) turns a valid game invalid.
  request(force) {
    const { game } = this.app.store.state;
    const v = this.verdict;
    if (setupProblems(game).length) {
      Object.assign(v, { key: '', ok: null, error: null, pending: false });
      return;
    }
    const known = Object.fromEntries(Object.entries(this.clues()).filter(([p]) => +p <= game.players));
    const g = { ...game, known };
    const key = JSON.stringify(g);
    if (key === v.key && !force) return;
    Object.assign(v, { key, pending: true });
    this.app.engine.latest('validate', 'validate', { game: g }).then(
      (ok) => {
        if (ok === undefined || v.key !== key) return;
        const was = v.ok;
        Object.assign(v, { ok, error: null, pending: false });
        if (was && !ok && this.loud) buzz(); // only when it turns invalid, not while it stays so
        this.loud = false;
        this.app.rerender();
      },
      (err) => {
        if (v.key !== key) return;
        Object.assign(v, { ok: null, error: err.message, pending: false });
        this.loud = false;
        this.app.rerender();
      },
    );
  }

  // statusHtml is the verdict line shown on both panels.
  statusHtml() {
    const { game } = this.app.store.state;
    const problems = setupProblems(game);
    if (problems.length) return `<p class="status warn">${t('play.finishSetup', { problems: problems.join(' ') })}</p>`;
    const v = this.verdict;
    if (v.error) return `<p class="status warn">⚠ ${v.error}</p>`;
    if (v.ok === null) return `<p class="status muted">${t('validate.checking')}</p>`;
    if (!v.ok) return `<p class="status warn">${t('validate.contradiction')}</p>`;
    const n = Object.keys(this.clues()).filter((p) => +p <= game.players).length;
    return `<p class="status ok">${t(n ? 'validate.consistent' : 'validate.consistentNone')}</p>`;
  }
}

// ValidateMarkers places discs and cubes, like the Play tab but with no
// analysis: the verdict line and the buzzer are the only feedback.
export class ValidateMarkers {
  constructor(root, v) {
    this.root = root;
    this.v = v;
  }

  overlay() {
    return new Map(); // anything the board could show would give the clues away
  }

  onHex(x, y) {
    const { store, toast } = this.v.app;
    const { game, ui } = store.state;
    const { markers, message } = tapMarker(game, ui.tool, x, y);
    if (message) toast(message);
    if (markers) {
      this.v.loud = true;
      store.update((s) => setMarkers(s, markers));
    }
  }

  render() {
    const { store } = this.v.app;
    const { game, ui, history } = store.state;
    const tool = ui.tool;
    if (tool.player > game.players) tool.player = 1;
    this.root.innerHTML = `
      ${this.v.statusHtml()}
      <h3>${t('play.place')}</h3>
      <div class="chips">${seatOrder(game).map((p) => `
        <button data-tool-player="${p}" class="chip ${tool.player === p ? 'on' : ''}">${seatLabel(game, p)}</button>`).join('')}
      </div>
      <div class="field">
        <div class="seg">
          <button data-cube="0" class="${tool.cube ? '' : 'on'}">● ${t('common.disc')}</button>
          <button data-cube="1" class="${tool.cube ? 'on' : ''}">■ ${t('common.cube')}</button>
        </div>
        <div class="seg">
          <button data-act="undo" ${history.past.length ? '' : 'disabled'}>↶ ${t('play.undo')}</button>
          <button data-act="redo" ${history.future.length ? '' : 'disabled'}>↷ ${t('play.redo')}</button>
        </div>
      </div>
      <p class="hint">${t('play.tapHint', { count: game.markers.length })}</p>`;
    const q = (sel) => this.root.querySelectorAll(sel);
    q('[data-tool-player]').forEach((b) => (b.onclick = () => store.update((s) => (s.ui.tool.player = +b.dataset.toolPlayer))));
    q('[data-cube]').forEach((b) => (b.onclick = () => store.update((s) => (s.ui.tool.cube = b.dataset.cube === '1'))));
    for (const [act, fn] of [['undo', undo], ['redo', redo]]) {
      q(`[data-act="${act}"]`).forEach((b) => (b.onclick = () => {
        this.v.loud = true;
        store.update((s) => fn(s));
      }));
    }
  }
}

// ValidateClues takes each player's clue blind, and verifies it on re-entry.
export class ValidateClues {
  constructor(root, v) {
    this.root = root;
    this.v = v;
    this.seat = 0; // the seat whose clue is being entered or verified, 0 for none
    document.addEventListener('keydown', (e) => this.onDigit(e));
  }

  // onDigit starts a clue number with the digit pressed: the number entry
  // takes focus and shows it. Other keys are left alone.
  onDigit(e) {
    if (!/^\d$/.test(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    const input = this.root.querySelector('#validate-clue-number');
    if (!input || e.target.closest?.('input, select, textarea, [contenteditable]') || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    input.value = e.key;
    input.focus();
  }

  overlay() {
    return new Map();
  }

  onHex() {
    this.v.app.toast(t('validate.useMarkers'));
  }

  render() {
    const { store, toast, rerender } = this.v.app;
    const { game } = store.state;
    this.v.request(false);
    const clues = this.v.clues();
    const seats = seatOrder(game);
    if (this.seat > game.players) this.seat = 0;

    // Keep a choice made but not yet submitted if a redraw lands meanwhile.
    const open = this.root.querySelector('#validate-rule');
    const keep = open && +open.dataset.seat === this.seat ? open.value : '';

    const rules = this.v.rulesFor(game.advanced);
    const entry = !this.seat ? '' : `
      <h3>${t('validate.handTo', { player: seatLabel(game, this.seat) })}</h3>
      <p class="hint">${t(clues[this.seat] ? 'validate.verifyHint' : 'validate.enterHint')}</p>
      <div class="clue-row">
        <select id="validate-rule" data-seat="${this.seat}" ${rules ? '' : 'disabled'}>
          <option value="">${t('me.notSet')}</option>
          ${rules ? [...ruleGroups(rules)].map(([g, rs]) => `<optgroup label="${g}">${rs.map((r) =>
            `<option value="${r.name}">${ruleLabel(r.name)}</option>`).join('')}</optgroup>`).join('') : ''}
        </select>
        ${rules && hasClueNumbers(seatColors(game)[this.seat - 1]) ? clueNumberField('validate-clue-number') : ''}
      </div>
      <div class="actions">
        <button id="validate-go">${t(clues[this.seat] ? 'validate.verify' : 'validate.save')}</button>
        ${clues[this.seat] ? `<button id="validate-forget" class="danger">${t('validate.forget')}</button>` : ''}
        <button id="validate-cancel">${t('validate.cancel')}</button>
      </div>`;

    this.root.innerHTML = `
      <p class="hint">${t('validate.intro')}</p>
      ${this.v.statusHtml()}
      <h3>${t('validate.whose')}</h3>
      <div class="chips">${seats.map((p) => `
        <button data-seat="${p}" class="chip ${this.seat === p ? 'on' : ''}">${seatLabel(game, p)}
          <span class="muted">${t(clues[p] ? 'validate.set' : 'validate.unset')}</span></button>`).join('')}
      </div>
      ${entry}`;

    const select = this.root.querySelector('#validate-rule');
    if (select && keep) select.value = keep;
    const q = (sel) => this.root.querySelector(sel);
    this.root.querySelectorAll('button[data-seat]').forEach((b) => (b.onclick = () => {
      this.seat = this.seat === +b.dataset.seat ? 0 : +b.dataset.seat;
      rerender();
    }));
    if (!this.seat) return;
    const p = this.seat;
    q('#validate-cancel').onclick = () => {
      this.seat = 0;
      rerender();
    };
    q('#validate-forget')?.addEventListener('click', () => {
      this.seat = 0;
      this.v.setClue(p, null);
      toast(t('validate.forgotten', { player: seatName(game, p) }));
    });
    // submit saves or verifies the rule entered for this seat. Its messages
    // never name the rule, and a clue number reaches it without the select.
    const submit = (rule) => {
      if (!rule) {
        toast(t('validate.pick'));
        return;
      }
      if (!clues[p]) {
        this.seat = 0;
        this.v.setClue(p, rule);
        toast(t('validate.saved', { player: seatName(game, p) }));
      } else if (rule === clues[p]) {
        this.seat = 0;
        toast(t('validate.matches', { player: seatName(game, p) }));
        rerender();
      } else {
        buzz();
        toast(t('validate.mismatch', { player: seatName(game, p) }));
        select.value = '';
      }
    };
    q('#validate-go').onclick = () => submit(select.value);
    const number = q('#validate-clue-number');
    if (number) {
      onClueNumber(number, seatColors(game)[p - 1], toast,
        (name) => !!select.querySelector(`option[value="${name}"]`), submit);
    }
  }
}
