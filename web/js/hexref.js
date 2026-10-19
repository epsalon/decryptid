// Coordinates shown in the panels ("3,4") are hex references: hovering one
// (or touching it on a phone, or focusing it with the keyboard) spotlights
// that hex on the board. When the board is scrolled out of view, a floating
// copy of it pops up so the spotlight can be seen.

// hexRef renders a coordinate as a hex reference. Unless focusable is false,
// it is also in the Tab order, and keyboard focus spotlights it.
export const hexRef = (x, y, focusable = true) =>
  `<span class="hexref" data-hex="${x},${y}"${focusable ? ' tabindex="0"' : ''}>${x},${y}</span>`;

// linkHexRefs turns every "x,y" coordinate in plain text into a hex reference.
export const linkHexRefs = (text) => text.replace(/\b(1[01]|\d),([0-8])\b/g, (_, x, y) => hexRef(x, y));

const TOUCH_MS = 2500; // how long a touch keeps the spotlight on

let clearStale = () => {};

// dropStaleHexRef clears a spotlight whose coordinate was redrawn away (the
// panel re-renders while it's hovered, so "pointer left" never fires).
export const dropStaleHexRef = () => clearStale();

export function installHexRefs(board) {
  let touchTimer = 0;
  let peek = null;
  let active = null; // the hex reference being shown
  const ref = (e) => e.target.closest?.('.hexref');
  const show = (el) => {
    active = el;
    board.spotlight(...el.dataset.hex.split(',').map(Number));
  };
  const hide = () => {
    active = null;
    board.spotlight(null);
    peek?.remove();
    peek = null;
  };
  clearStale = () => {
    if (active && !active.isConnected && !touchTimer) hide();
  };

  // Mouse and pen: spotlight while hovering.
  document.addEventListener('pointerover', (e) => {
    const r = ref(e);
    if (r && e.pointerType !== 'touch') show(r);
  });
  document.addEventListener('pointerout', (e) => {
    const r = ref(e);
    if (r && e.pointerType !== 'touch' && !r.contains(e.relatedTarget)) hide();
  });

  // Touch: spotlight for a moment, with a floating copy of the board if the
  // real one is off screen.
  document.addEventListener('pointerdown', (e) => {
    const r = ref(e);
    if (!r || e.pointerType !== 'touch') return;
    clearTimeout(touchTimer);
    hide();
    show(r);
    if (!onScreen(board.svg)) {
      peek = document.createElement('div');
      peek.className = 'board-peek';
      peek.appendChild(board.svg.cloneNode(true));
      document.body.appendChild(peek);
    }
    touchTimer = setTimeout(() => {
      touchTimer = 0;
      hide();
    }, TOUCH_MS);
  });

  // Keyboard: spotlight while a coordinate has keyboard focus (Tab), and
  // clear it the moment focus leaves. Taps and clicks also focus, so only
  // keyboard focus (:focus-visible) shows it.
  document.addEventListener('focusin', (e) => {
    const r = ref(e);
    if (r && r.matches(':focus-visible')) show(r);
  });
  document.addEventListener('focusout', (e) => {
    if (ref(e) === active && !touchTimer) hide();
  });
  // Any other key (arrows, letters, Enter...) clears a hover or focus
  // spotlight, so it never lingers over the keyboard cursor.
  document.addEventListener('keydown', (e) => {
    if (active && !touchTimer && !['Tab', 'Shift'].includes(e.key)) hide();
  }, true);
}

// onScreen reports whether most of the element is inside the viewport.
function onScreen(el) {
  const r = el.getBoundingClientRect();
  const visible = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
  return visible > r.height * 0.6;
}
