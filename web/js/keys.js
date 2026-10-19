// Keyboard play: the whole game works without a pointer.
//
//   1-5          switch tabs (Setup, Me, Play, Advice, vs AI)
//   arrows       move the board cursor; Enter acts on its hex, like a tap
//   Esc          hide the cursor (or close this help)
//   ?            show all shortcuts
//
// Tabs add their own keys (Play: colours and pieces; vs AI: ask/search).
// Buttons, selects and chips are reachable with Tab as usual. Keys never
// fire while typing in a field or while a dialog is open.

const TABS = ['setup', 'me', 'play', 'advice', 'match'];

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
    } else if (/^[1-5]$/.test(e.key)) {
      app.store.update((s) => (s.ui.tab = TABS[+e.key - 1]));
    }
  });
}

let help = null;
function toggleHelp() {
  if (help?.open) return help.close();
  help = document.createElement('dialog');
  help.className = 'help';
  help.innerHTML = `<form method="dialog"><h3>Keyboard shortcuts</h3>
    <table>
      <tr><th colspan="2">Anywhere</th></tr>
      <tr><td><kbd>1</kbd>–<kbd>5</kbd></td><td>Setup, Me, Play, Advice, vs AI</td></tr>
      <tr><td><kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd></td><td>Move the board cursor</td></tr>
      <tr><td><kbd>Enter</kbd></td><td>Act on the cursor's hex (like tapping it)</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Hide the cursor</td></tr>
      <tr><td><kbd>Tab</kbd></td><td>Move between buttons and fields</td></tr>
      <tr><td><kbd>?</kbd></td><td>This help</td></tr>
      <tr><th colspan="2">Play</th></tr>
      <tr><td><kbd>Y</kbd> <kbd>R</kbd> <kbd>G</kbd> <kbd>C</kbd> <kbd>P</kbd></td><td>Place that colour's cube</td></tr>
      <tr><td><kbd>Shift</kbd> + letter</td><td>Place that colour's disc</td></tr>
      <tr><td><kbd>Space</kbd></td><td>Switch disc / cube</td></tr>
      <tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd></td><td>Undo (<kbd>Shift</kbd> to redo)</td></tr>
      <tr><th colspan="2">vs AI, on your turn</th></tr>
      <tr><td><kbd>A</kbd> / <kbd>S</kbd></td><td>Ask / Search</td></tr>
      <tr><td><kbd>Y</kbd> <kbd>R</kbd> <kbd>G</kbd> <kbd>C</kbd> <kbd>P</kbd></td><td>Whom to ask</td></tr>
      <tr><td><kbd>Enter</kbd></td><td>Ask about, search, or cube the cursor's hex</td></tr>
    </table>
    <div class="actions"><button value="close">Close</button></div></form>`;
  help.addEventListener('close', () => help.remove());
  document.body.appendChild(help);
  help.showModal();
}
