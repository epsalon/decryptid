// Coordinates shown in the panels ("3,4") are hex references: hovering one
// (or touching it on a phone, or focusing it with the keyboard) spotlights
// that hex on the board. When the board is scrolled out of view, a floating
// copy of it pops up so the spotlight can be seen.

// hexRef renders a coordinate as a hex reference.
export const hexRef = (x, y) => `<span class="hexref" data-hex="${x},${y}" tabindex="0">${x},${y}</span>`;

// linkHexRefs turns every "x,y" coordinate in plain text into a hex reference.
export const linkHexRefs = (text) => text.replace(/\b(1[01]|\d),([0-8])\b/g, (_, x, y) => hexRef(x, y));

const TOUCH_MS = 2500; // how long a touch keeps the spotlight on

export function installHexRefs(board) {
  let touchTimer = 0;
  let peek = null;
  const ref = (e) => e.target.closest?.('.hexref');
  const show = (el) => board.spotlight(...el.dataset.hex.split(',').map(Number));
  const hide = () => {
    board.spotlight(null);
    peek?.remove();
    peek = null;
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

  // Keyboard: spotlight while focused. Taps and clicks also focus, and the
  // panel may then redraw (removing the focused element), so only keyboard
  // focus counts, and losing focus never cancels a touch spotlight.
  document.addEventListener('focusin', (e) => {
    const r = ref(e);
    if (r && r.matches(':focus-visible')) show(r);
  });
  document.addEventListener('focusout', (e) => {
    const r = ref(e);
    if (r && r.matches(':focus-visible') && !touchTimer) hide();
  });
}

// onScreen reports whether most of the element is inside the viewport.
function onScreen(el) {
  const r = el.getBoundingClientRect();
  const visible = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
  return visible > r.height * 0.6;
}
