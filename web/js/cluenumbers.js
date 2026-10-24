import { t } from './i18n.js';

// Clue numbers of the Cryptid cluebooks. Each player color has its own book,
// and its clues are numbered 1 to 96, so a number plus a color
// gives one rule. Only the rule names are here, not the books’ text. The Blue book
// serves cyan, the fourth color.
const CLUE_RULES = {
  yellow: [
    'Not On Swamp or Mountain', 'Distance 2 from Bear territory', 'Not Distance 2 from Cougar territory', 'Distance 1 from Mountain',
    'Not On Mountain or Desert', 'Not Distance 3 from Black structure', 'On Forest or Desert', 'Not On Forest or Water',
    'Not Distance 2 from Bear territory', 'Not Distance 1 from Water', 'On Desert or Water', 'Not On Swamp or Desert',
    'Distance 2 from Bear territory', 'Distance 1 from Swamp', 'Distance 3 from Green structure', 'Not Distance 2 from Standing Stone',
    'Distance 2 from Abandoned Shed', 'Not Distance 2 from Standing Stone', 'On Forest or Mountain', 'Distance 1 from Water',
    'Not Distance 1 from Desert', 'Distance 3 from Black structure', 'Not On Mountain or Water', 'On Mountain or Water',
    'On Swamp or Mountain', 'Distance 1 from Desert', 'On Swamp or Desert', 'Not On Forest or Desert',
    'Distance 3 from Black structure', 'Distance 1 from Forest', 'Not On Swamp or Mountain', 'Not Distance 3 from Blue structure',
    'Not On Desert or Water', 'On Mountain or Desert', 'On Swamp or Water', 'Distance 3 from White structure',
    'Not On Mountain or Water', 'Not Distance 2 from Abandoned Shed', 'On Forest or Swamp', 'On Swamp or Mountain',
    'Not On Swamp or Water', 'Distance 1 from Swamp', 'Distance 3 from Blue structure', 'Not Distance 1 from Mountain',
    'Distance 2 from Standing Stone', 'Distance 1 from Desert', 'Distance 1 from Mountain', 'Not Distance 3 from White structure',
    'Distance 2 from Standing Stone', 'On Forest or Water', 'On Swamp or Desert', 'Distance 2 from Abandoned Shed',
    'On Mountain or Water', 'Not On Forest or Mountain', 'Not Distance 3 from Blue structure', 'Distance 3 from White structure',
    'Not On Swamp or Water', 'Distance 1 from either animal territory', 'On Forest or Swamp', 'Not On Forest or Swamp',
    'Not Distance 1 from Water', 'Not Distance 1 from either animal territory', 'Distance 2 from Cougar territory', 'Not Distance 2 from Bear territory',
    'Not On Forest or Water', 'Not Distance 3 from Black structure', 'Not Distance 1 from Desert', 'Not Distance 2 from Abandoned Shed',
    'On Swamp or Water', 'Not Distance 3 from Green structure', 'Not On Forest or Swamp', 'Distance 2 from Cougar territory',
    'Distance 3 from Blue structure', 'On Forest or Mountain', 'Not On Forest or Mountain', 'Not On Desert or Water',
    'Distance 1 from Forest', 'On Desert or Water', 'Not Distance 1 from Forest', 'Not On Forest or Desert',
    'On Mountain or Desert', 'Not Distance 1 from either animal territory', 'Distance 1 from either animal territory', 'Distance 1 from Water',
    'Distance 3 from Green structure', 'On Forest or Water', 'Not Distance 1 from Swamp', 'Not Distance 1 from Mountain',
    'Not Distance 3 from Green structure', 'Not Distance 3 from White structure', 'On Forest or Desert', 'Not Distance 1 from Forest',
    'Not On Mountain or Desert', 'Not Distance 1 from Swamp', 'Not Distance 2 from Cougar territory', 'Not On Swamp or Desert',
  ],
  red: [
    'Distance 2 from Bear territory', 'On Mountain or Water', 'Distance 1 from Mountain', 'Not On Mountain or Water',
    'Not On Forest or Water', 'Not Distance 2 from Bear territory', 'Not On Desert or Water', 'Not On Forest or Swamp',
    'On Swamp or Mountain', 'On Forest or Water', 'Not Distance 2 from Standing Stone', 'Distance 1 from Forest',
    'Distance 3 from White structure', 'Not Distance 1 from Water', 'Not On Forest or Mountain', 'Not Distance 1 from either animal territory',
    'Distance 2 from Cougar territory', 'Distance 3 from Blue structure', 'Distance 1 from Swamp', 'Distance 3 from Green structure',
    'Distance 2 from Abandoned Shed', 'Not On Desert or Water', 'Not Distance 2 from Cougar territory', 'Not Distance 2 from Abandoned Shed',
    'On Desert or Water', 'Distance 1 from Water', 'On Desert or Water', 'Distance 1 from Swamp',
    'On Forest or Mountain', 'Distance 1 from Forest', 'Distance 3 from Black structure', 'Not On Forest or Swamp',
    'Distance 3 from Green structure', 'On Swamp or Desert', 'Not On Swamp or Mountain', 'Distance 3 from Blue structure',
    'Not Distance 1 from Mountain', 'Not On Forest or Desert', 'Not Distance 2 from Bear territory', 'Not On Swamp or Mountain',
    'Not Distance 2 from Abandoned Shed', 'Distance 3 from White structure', 'Not Distance 1 from Desert', 'On Swamp or Water',
    'Not On Mountain or Desert', 'Distance 2 from Standing Stone', 'Not On Swamp or Water', 'Distance 2 from Cougar territory',
    'Not Distance 1 from either animal territory', 'Distance 1 from either animal territory', 'Not On Swamp or Desert', 'Distance 1 from Mountain',
    'Not Distance 3 from White structure', 'On Forest or Swamp', 'Distance 2 from Standing Stone', 'On Mountain or Desert',
    'On Forest or Desert', 'Not Distance 1 from Swamp', 'Not Distance 3 from Black structure', 'Not On Swamp or Water',
    'On Swamp or Desert', 'Not Distance 3 from Green structure', 'Not On Mountain or Desert', 'Not On Forest or Mountain',
    'Distance 1 from Desert', 'On Mountain or Desert', 'Not Distance 1 from Desert', 'On Forest or Swamp',
    'Distance 1 from Desert', 'Not Distance 2 from Standing Stone', 'Not On Mountain or Water', 'On Swamp or Mountain',
    'Not On Forest or Water', 'Not Distance 1 from Forest', 'Not On Forest or Desert', 'Not Distance 3 from White structure',
    'On Forest or Desert', 'Not Distance 1 from Forest', 'Not Distance 1 from Mountain', 'On Forest or Mountain',
    'Not Distance 3 from Blue structure', 'Not On Swamp or Desert', 'Distance 2 from Abandoned Shed', 'Distance 1 from either animal territory',
    'Distance 1 from Water', 'Not Distance 1 from Water', 'Not Distance 3 from Blue structure', 'On Forest or Water',
    'Not Distance 1 from Swamp', 'Not Distance 3 from Black structure', 'Distance 2 from Bear territory', 'On Mountain or Water',
    'Distance 3 from Black structure', 'Not Distance 2 from Cougar territory', 'On Swamp or Water', 'Not Distance 3 from Green structure',
  ],
  green: [
    'On Swamp or Desert', 'Distance 2 from Cougar territory', 'Distance 3 from Blue structure', 'Not On Forest or Swamp',
    'Distance 3 from Green structure', 'Distance 1 from Desert', 'Not On Swamp or Desert', 'On Forest or Swamp',
    'Not On Swamp or Water', 'Not Distance 3 from Black structure', 'Distance 2 from Abandoned Shed', 'Not Distance 1 from Desert',
    'On Forest or Water', 'Not Distance 3 from White structure', 'Not Distance 1 from either animal territory', 'Distance 2 from Bear territory',
    'Distance 1 from Water', 'Not On Swamp or Mountain', 'Distance 1 from Mountain', 'Not Distance 3 from Black structure',
    'Not Distance 1 from Swamp', 'Distance 3 from Black structure', 'Not Distance 3 from Green structure', 'Not On Forest or Desert',
    'Distance 1 from Swamp', 'Not On Forest or Mountain', 'Not Distance 2 from Bear territory', 'On Forest or Mountain',
    'On Swamp or Mountain', 'Not Distance 2 from Cougar territory', 'Not Distance 2 from Standing Stone', 'On Swamp or Water',
    'On Desert or Water', 'Distance 3 from Blue structure', 'Distance 2 from Standing Stone', 'On Mountain or Water',
    'Not On Forest or Swamp', 'Not On Swamp or Water', 'Not Distance 2 from Abandoned Shed', 'Not Distance 1 from Mountain',
    'Not On Mountain or Desert', 'Distance 1 from Forest', 'Distance 2 from Bear territory', 'Not Distance 1 from either animal territory',
    'Distance 3 from Green structure', 'Distance 1 from either animal territory', 'On Mountain or Desert', 'Not Distance 2 from Bear territory',
    'Distance 1 from Mountain', 'Not On Desert or Water', 'Not Distance 1 from Forest', 'Not Distance 2 from Abandoned Shed',
    'Distance 2 from Abandoned Shed', 'Distance 1 from Swamp', 'Not Distance 1 from Desert', 'Not On Swamp or Desert',
    'Not On Mountain or Desert', 'Distance 3 from Black structure', 'Not Distance 1 from Forest', 'Not Distance 3 from Blue structure',
    'Distance 1 from Water', 'On Forest or Water', 'Not On Desert or Water', 'Distance 3 from White structure',
    'Distance 2 from Standing Stone', 'Distance 2 from Cougar territory', 'Distance 1 from either animal territory', 'Not Distance 1 from Water',
    'Not Distance 3 from Blue structure', 'Not On Forest or Desert', 'Distance 1 from Forest', 'Not On Forest or Mountain',
    'On Swamp or Desert', 'On Mountain or Water', 'Not On Swamp or Mountain', 'On Forest or Desert',
    'On Desert or Water', 'Not Distance 3 from White structure', 'Distance 3 from White structure', 'Distance 1 from Desert',
    'Not Distance 1 from Mountain', 'On Forest or Desert', 'On Forest or Mountain', 'Not On Mountain or Water',
    'Not Distance 1 from Water', 'On Swamp or Water', 'Not On Forest or Water', 'Not Distance 2 from Cougar territory',
    'On Mountain or Desert', 'On Forest or Swamp', 'Not On Mountain or Water', 'On Swamp or Mountain',
    'Not On Forest or Water', 'Not Distance 2 from Standing Stone', 'Not Distance 3 from Green structure', 'Not Distance 1 from Swamp',
  ],
  blue: [
    'Distance 3 from Blue structure', 'Distance 1 from Water', 'Not On Mountain or Water', 'On Forest or Swamp',
    'Not On Desert or Water', 'Distance 3 from Blue structure', 'Not Distance 1 from Desert', 'Not On Forest or Swamp',
    'Not On Forest or Water', 'Not Distance 2 from Standing Stone', 'Distance 3 from Green structure', 'Distance 2 from Standing Stone',
    'On Forest or Water', 'Not Distance 3 from Black structure', 'Not On Forest or Swamp', 'Not Distance 2 from Standing Stone',
    'Not Distance 1 from Mountain', 'On Mountain or Desert', 'Not On Swamp or Desert', 'On Swamp or Desert',
    'On Forest or Desert', 'Not On Forest or Desert', 'Distance 1 from Mountain', 'Not Distance 1 from Swamp',
    'Distance 3 from Black structure', 'Not Distance 3 from Blue structure', 'Distance 1 from Forest', 'Distance 3 from White structure',
    'Distance 1 from either animal territory', 'Not Distance 3 from White structure', 'On Swamp or Water', 'On Swamp or Mountain',
    'Not On Swamp or Desert', 'Not Distance 3 from Green structure', 'Distance 3 from Green structure', 'Distance 1 from Forest',
    'Not On Desert or Water', 'Not Distance 2 from Bear territory', 'On Mountain or Water', 'Distance 3 from White structure',
    'On Mountain or Water', 'Not Distance 3 from Blue structure', 'On Forest or Mountain', 'Distance 2 from Bear territory',
    'Not Distance 1 from Swamp', 'Not Distance 1 from Forest', 'Distance 3 from Black structure', 'On Swamp or Desert',
    'Distance 2 from Cougar territory', 'Distance 2 from Cougar territory', 'Not On Swamp or Mountain', 'Not Distance 2 from Bear territory',
    'Distance 1 from either animal territory', 'Distance 2 from Bear territory', 'Not On Forest or Mountain', 'Not On Swamp or Water',
    'Not On Mountain or Water', 'Not Distance 1 from either animal territory', 'Not On Forest or Water', 'Not On Mountain or Desert',
    'Not On Forest or Desert', 'Not Distance 1 from Water', 'Distance 2 from Standing Stone', 'Not On Swamp or Mountain',
    'Distance 2 from Abandoned Shed', 'Not On Swamp or Water', 'Not Distance 1 from Mountain', 'Distance 1 from Desert',
    'Not Distance 2 from Cougar territory', 'On Swamp or Water', 'Distance 2 from Abandoned Shed', 'Not Distance 3 from Green structure',
    'Distance 1 from Water', 'On Forest or Desert', 'Not Distance 1 from either animal territory', 'Not Distance 1 from Forest',
    'On Forest or Mountain', 'Not Distance 2 from Abandoned Shed', 'Not On Forest or Mountain', 'On Mountain or Desert',
    'Distance 1 from Desert', 'Not Distance 1 from Water', 'Not Distance 2 from Abandoned Shed', 'Distance 1 from Swamp',
    'On Desert or Water', 'Not Distance 2 from Cougar territory', 'On Forest or Water', 'Not Distance 3 from Black structure',
    'On Forest or Swamp', 'Not On Mountain or Desert', 'Not Distance 3 from White structure', 'On Desert or Water',
    'Distance 1 from Mountain', 'Distance 1 from Swamp', 'Not Distance 1 from Desert', 'On Swamp or Mountain',
  ],
  purple: [
    'On Forest or Swamp', 'Distance 1 from Forest', 'Not Distance 1 from either animal territory', 'Not On Forest or Mountain',
    'Not On Forest or Swamp', 'Not Distance 3 from Blue structure', 'Distance 3 from Black structure', 'On Desert or Water',
    'Distance 3 from Green structure', 'Not Distance 2 from Abandoned Shed', 'Distance 1 from Desert', 'Not Distance 2 from Bear territory',
    'Distance 1 from either animal territory', 'Not Distance 1 from Mountain', 'Not Distance 1 from either animal territory', 'Distance 3 from White structure',
    'Distance 1 from Water', 'Not Distance 1 from Desert', 'Distance 3 from Black structure', 'Not On Forest or Desert',
    'Distance 2 from Cougar territory', 'Distance 1 from Water', 'Distance 2 from Cougar territory', 'Not On Swamp or Desert',
    'Not On Forest or Desert', 'On Forest or Mountain', 'On Forest or Water', 'Distance 3 from Green structure',
    'Distance 1 from Swamp', 'Distance 2 from Standing Stone', 'Not On Swamp or Water', 'Not On Mountain or Desert',
    'On Swamp or Mountain', 'Distance 1 from Mountain', 'Not Distance 2 from Cougar territory', 'Not On Desert or Water',
    'On Forest or Water', 'On Swamp or Mountain', 'Not On Swamp or Water', 'Not On Forest or Mountain',
    'Distance 3 from Blue structure', 'Distance 1 from Forest', 'Not Distance 3 from White structure', 'On Mountain or Water',
    'On Mountain or Desert', 'Not On Desert or Water', 'Not On Swamp or Desert', 'On Forest or Swamp',
    'Not Distance 1 from Mountain', 'Distance 3 from Blue structure', 'On Forest or Mountain', 'Distance 3 from White structure',
    'Not Distance 1 from Swamp', 'Not On Swamp or Mountain', 'On Swamp or Desert', 'Not Distance 2 from Bear territory',
    'Distance 1 from Swamp', 'Not Distance 1 from Water', 'Not Distance 2 from Abandoned Shed', 'Not Distance 2 from Standing Stone',
    'Distance 2 from Abandoned Shed', 'On Mountain or Desert', 'Not Distance 3 from White structure', 'Not Distance 1 from Water',
    'Not Distance 3 from Green structure', 'On Swamp or Water', 'Distance 1 from Desert', 'Distance 1 from Mountain',
    'Not On Swamp or Mountain', 'Not Distance 3 from Black structure', 'Not On Forest or Water', 'On Forest or Desert',
    'Not Distance 3 from Black structure', 'Not Distance 3 from Green structure', 'Not Distance 3 from Blue structure', 'On Swamp or Desert',
    'Not On Forest or Swamp', 'On Desert or Water', 'Not Distance 1 from Swamp', 'Not On Mountain or Water',
    'Not Distance 1 from Forest', 'Distance 2 from Abandoned Shed', 'Distance 2 from Standing Stone', 'On Mountain or Water',
    'Not Distance 2 from Cougar territory', 'Distance 2 from Bear territory', 'On Forest or Desert', 'Not On Mountain or Water',
    'Distance 2 from Bear territory', 'Not On Mountain or Desert', 'Not Distance 1 from Forest', 'Distance 1 from either animal territory',
    'Not On Forest or Water', 'Not Distance 2 from Standing Stone', 'On Swamp or Water', 'Not Distance 1 from Desert',
  ],
};

// The book that numbers a seat's color (cyan has none of its own).
const BOOK = { yellow: 'yellow', red: 'red', green: 'green', cyan: 'blue', purple: 'purple' };

// hasClueNumbers reports whether a seat's color has a cluebook, so its clues
// can be entered by clue number.
export const hasClueNumbers = (color) => color in BOOK;

// clueRule is the rule name for a clue number in a color's book, or null when
// the text is not a number from 1 to 96.
export function clueRule(color, text) {
  if (!/^\s*\d{1,2}\s*$/.test(text)) return null;
  const n = +text;
  return n >= 1 && n <= 96 ? CLUE_RULES[BOOK[color]][n - 1] : null;
}

// clueNumberField is the clue-number entry: a bare input showing "##", named
// for screen readers.
export const clueNumberField = (id) => `<input id="${id}" class="clue-number-input" placeholder="##" aria-label="${t('clueNumber.label')}" inputmode="numeric" maxlength="2" autocomplete="off">`;

// onClueNumber applies a clue number typed in input. choose(name) receives the
// rule name; has(name) says whether the current mode offers it. The number is
// never shown as a rule name here, so a caller that must stay blind can
// handle the choice itself. Refusals are reported with toast.
export function onClueNumber(input, color, toast, has, choose) {
  const apply = () => {
    const text = input.value;
    if (!text.trim()) return;
    input.value = '';
    const name = clueRule(color, text);
    if (!name) return toast(t('clueNumber.invalid'));
    if (!has(name)) return toast(t('clueNumber.advanced'));
    choose(name);
  };
  input.addEventListener('change', apply);
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    apply();
  });
}
