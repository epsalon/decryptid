// Keyboard play: the whole game works without a pointer.
//
//   1-6          switch tabs (Setup, Me, Play, Advice, Search, vs AI)
//   arrows       move the board cursor; Enter acts on its hex, like a tap
//   Esc          hide the cursor (or close this help)
//   ?            show all shortcuts
//
// Tabs add their own keys (Play: colors and pieces; vs AI: ask/search).
// Buttons, selects and chips are reachable with Tab as usual. Keys never
// fire while typing in a field or while a dialog is open.

import { t } from './i18n.js';

const TABS = ['setup', 'me', 'play', 'advice', 'search', 'match'];

// typing reports whether a key event belongs to a text field or dialog.
export const typing = (e) =>
  !!e.target.closest?.('input, select, textarea, [contenteditable]') || !!document.querySelector('dialog[open]');

export function installKeys(app, board, onHex) {
  let cursor = null;
  const move = (dx, dy) => {
    cursor = cursor ? { x: Math.min(11, Math.max(0, cursor.x + dx)), y: Math.min(8, Math.max(0, cursor.y + dy)) } : { x: 5, y: 4 };
    board.setCursor(cursor.x, cursor.y);
  };
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  // Using the mouse on the board hides the keyboard cursor.
  board.svg.addEventListener('pointermove', (e) => {
    if (cursor && e.pointerType === 'mouse') {
      cursor = null;
      board.setCursor(null);
    }
  });

  document.addEventListener('keydown', (e) => {
    // Once a key is used, show keyboard hints even on touch devices.
    if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) document.body.classList.add('kbd');
    if (e.key === '?' && !e.target.closest?.('input, select, textarea')) {
      e.preventDefault();
      toggleHelp();
      return;
    }
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (arrows[e.key]) {
      e.preventDefault(); // don't scroll the page
      // Hand Enter to the cursor, not to a button that still has focus.
      if (document.activeElement?.matches?.('button, a, summary, [tabindex]')) document.activeElement.blur();
      move(...arrows[e.key]);
    } else if (e.key === 'Enter' && cursor && !e.target.closest?.('button, a, summary, [tabindex]')) {
      e.preventDefault();
      onHex(cursor.x, cursor.y);
    } else if (e.key === 'Escape' && cursor) {
      cursor = null;
      board.setCursor(null);
    } else if (/^[1-6]$/.test(e.key)) {
      app.store.update((s) => (s.ui.tab = TABS[+e.key - 1]));
    }
  });
}

let help = null;
function toggleHelp() {
  if (help?.open) return help.close();
  help = document.createElement('dialog');
  help.className = 'help';
  const row = (keys, text) => `<tr><td>${keys}</td><td>${t(text)}</td></tr>`;
  const head = (text) => `<tr><th colspan="2">${t(text)}</th></tr>`;
  const letters = '<kbd>Y</kbd> <kbd>R</kbd> <kbd>G</kbd> <kbd>C</kbd> <kbd>P</kbd>';
  help.innerHTML = `<form method="dialog"><h3>${t('keys.title')}</h3>
    <table>
      ${head('keys.anywhere')}
      ${row('<kbd>1</kbd>–<kbd>6</kbd>', 'keys.tabs')}
      ${row('<kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd>', 'keys.cursor')}
      ${row('<kbd>Enter</kbd>', 'keys.enter')}
      ${row('<kbd>Esc</kbd>', 'keys.escape')}
      ${row('<kbd>Tab</kbd>', 'keys.tab')}
      ${row('<kbd>?</kbd>', 'keys.help')}
      ${head('keys.play')}
      ${row(letters, 'keys.cube')}
      ${row(`<kbd>Shift</kbd> + ${t('keys.letter')}`, 'keys.disc')}
      ${row('<kbd>Space</kbd>', 'keys.toggle')}
      ${row('<kbd>Ctrl</kbd>+<kbd>Z</kbd>', 'keys.undo')}
      ${head('keys.match')}
      ${row('<kbd>A</kbd> / <kbd>S</kbd>', 'keys.askSearch')}
      ${row(letters, 'keys.whom')}
      ${row('<kbd>Enter</kbd>', 'keys.matchEnter')}
    </table>
    <div class="actions"><button value="close">${t('common.close')}</button></div></form>`;
  help.addEventListener('close', () => help.remove());
  document.body.appendChild(help);
  help.showModal();
}
