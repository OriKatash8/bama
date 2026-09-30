/**
 * Contact-detail detection for public text — no contact details before hire
 * (Terms §6.8). Contact details are exchanged in the project chat after hire and
 * revealed at completion; a phone number in a public profile skips all of that.
 *
 * Phone numbers and email addresses, each its own exported check, plus
 * containsContactDetails for both. Social-handle detection belongs here too, as
 * another separate check, when it is wanted.
 *
 * MIRROR: firestore.rules `hasContact` carries RULES_CONTACT_PATTERN verbatim —
 * KEEP IN SYNC. contactRulesSync.test.ts fails if the rules copy drifts. The
 * rules copy is ASCII-only (rules cannot normalize Unicode); this side
 * normalizes first, so it also catches fullwidth / Arabic-Indic digits and
 * fullwidth letters and @.
 */

// ── Normalization ────────────────────────────────────────────────────────────

const ZERO_WIDTH = /[\u200B-\u200F\u2060\uFEFF]/g;
// Each block's zero; the nine digits after it follow in order.
const DIGIT_ZEROS = [0x0660 /* Arabic-Indic */, 0x06f0 /* Eastern Arabic-Indic */];
// Fullwidth ASCII (！ … ～, incl. fullwidth digits, letters, ＠ and ．) sits at
// a fixed offset from ASCII.
const FULLWIDTH_FIRST = 0xff01;
const FULLWIDTH_LAST = 0xff5e;
const FULLWIDTH_OFFSET = 0xff01 - 0x21;

/** Unicode digit variants and fullwidth ASCII → ASCII, zero-width characters removed. */
export function normalizeForContactScan(text: string): string {
  let out = '';
  for (const ch of text.replace(ZERO_WIDTH, '')) {
    const code = ch.codePointAt(0)!;
    if (code >= FULLWIDTH_FIRST && code <= FULLWIDTH_LAST) { out += String.fromCharCode(code - FULLWIDTH_OFFSET); continue; }
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

// ── Email addresses ──────────────────────────────────────────────────────────
//
// local@domain.tld — the domain needs at least one dot and a 2+ letter TLD, so
// a handle (@roi.films has no local part), a bare "@", or "roi@localhost" is not
// an address. Spelled-out forms ("roi at gmail dot com") are not caught.

const EMAIL_CORE = '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+([.][A-Za-z0-9-]+)*[.][A-Za-z]{2,}';
const EMAIL_RE = new RegExp(EMAIL_CORE, 'g');

/** Every email address in `text`, as it appears after normalization. */
export function findEmails(text: string): string[] {
  if (!text) return [];
  return [...normalizeForContactScan(text).matchAll(EMAIL_RE)].map((m) => m[0]);
}

export function containsEmail(text: string): boolean {
  return findEmails(text).length > 0;
}

// ── Both ─────────────────────────────────────────────────────────────────────

/** A phone number or an email address. */
export function containsContactDetails(text: string): boolean {
  return containsPhoneNumber(text) || containsEmail(text);
}

/**
 * For firestore.rules: `s.matches(RULES_CONTACT_PATTERN)` is true when `s`
 * contains a phone number or an email address. One pattern, not two, so each
 * checked field or equipment item costs one matches() against the rules'
 * 1000-expression budget.
 */
export const RULES_CONTACT_PATTERN =
  `(?s).*((^|[^0-9])${phoneCore(RULES_SEP)}([^0-9]|$)|${EMAIL_CORE}).*`;
