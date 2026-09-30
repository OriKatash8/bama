/**
 * Contact-detail detection for public text — no contact details before hire
 * (Terms §6.8). Contact details are exchanged in the project chat after hire and
 * revealed at completion; a phone number in a public profile skips all of that.
 *
 * Phone numbers only, for now. Email / social-handle detection belongs here too,
 * as separate exported checks (containsEmail, containsSocialHandle), so each can
 * be switched on per field.
 *
 * MIRROR: firestore.rules `hasNoPhone` carries RULES_PHONE_PATTERN verbatim —
 * KEEP IN SYNC. contactFilter.test.ts fails if the rules copy drifts. The rules
 * copy is ASCII-only (rules cannot normalize Unicode digits); this side
 * normalizes first, so it also catches fullwidth / Arabic-Indic digits.
 */

// ── Normalization ────────────────────────────────────────────────────────────

const ZERO_WIDTH = /[​-‏⁠﻿]/g;
// Each block's zero; the nine digits after it follow in order.
const DIGIT_ZEROS = [0xff10 /* fullwidth */, 0x0660 /* Arabic-Indic */, 0x06f0 /* Eastern Arabic-Indic */];

/** Unicode digit variants → ASCII, zero-width characters removed. */
export function normalizeForContactScan(text: string): string {
  let out = '';
  for (const ch of text.replace(ZERO_WIDTH, '')) {
    const code = ch.codePointAt(0)!;
    const zero = DIGIT_ZEROS.find((z) => code >= z && code <= z + 9);
    out += zero === undefined ? ch : String(code - zero);
  }
  return out;
}

// ── Phone numbers (Israeli) ──────────────────────────────────────────────────
//
// Built from parts so the JS and the rules (RE2) versions are one pattern with
// a different separator class. No backslashes anywhere — rules string literals
// are safest without them — so digits are [0-9] and '+' is [+].
//
//   mobile      0 5 + 8 digits              052-123-4567
//   voip        0 7 + 8 digits              077-123-4567
//   landline    0 [2 3 4 8 9] + 7 digits    03-1234567
//   intl        +972 / 972 / 00972, optional stray 0, then the above without its 0
//   service     1-700 / 1-800 / 1-599 + 6 digits
//
// Any amount of space . - / ( ) between digits. The number may not touch
// another digit on either side, so a serial or a longer figure is not a phone.

function phoneCore(sep: string): string {
  const d = (n: number) => `(${sep}[0-9]){${n}}`;
  const rest = `(5${d(8)}|7${d(8)}|[23489]${d(7)})`;
  const intl = `(00|[+])?${sep}972${sep}(0${sep})?${rest}`;
  const local = `0${sep}${rest}`;
  const service = `1${sep}(7${sep}0${sep}0|8${sep}0${sep}0|5${sep}9${sep}9)${d(6)}`;
  return `(${intl}|${local}|${service})`;
}

const JS_SEP = '[\\s.()/-]*';
const RULES_SEP = '[[:space:].()/-]*';

/** For firestore.rules: `s.matches(RULES_PHONE_PATTERN)` is true when `s` contains a phone. */
export const RULES_PHONE_PATTERN = `(?s).*(^|[^0-9])${phoneCore(RULES_SEP)}([^0-9]|$).*`;

const PHONE_RE = new RegExp(`(?:^|[^0-9])(${phoneCore(JS_SEP)})(?=[^0-9]|$)`, 'g');

/** Every phone number in `text`, as it appears after normalization. */
export function findPhoneNumbers(text: string): string[] {
  if (!text) return [];
  return [...normalizeForContactScan(text).matchAll(PHONE_RE)].map((m) => m[1]);
}

export function containsPhoneNumber(text: string): boolean {
  return findPhoneNumbers(text).length > 0;
}
