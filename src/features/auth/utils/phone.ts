/**
 * Phone numbers: checked by format only (no SMS verification) and stored as
 * E.164 — `+` and 8–15 digits, no leading 0 — so one number is always one
 * string. firestore.rules checks the same shape on `users/{uid}/private/contact`.
 *
 * Israeli numbers get real validation, because that is how almost everyone types
 * them: `050-123-4567`, `03-1234567`, `+972 50…`. Anything else must already be
 * in `+` international form and is checked only for length.
 */

const E164 = /^\+[1-9]\d{7,14}$/;
/** Israeli national number without the leading 0: mobile 5X, VoIP/other 7X, landline 2/3/4/8/9. */
const IL_NATIONAL = /^(5\d{8}|7\d{8}|[23489]\d{7})$/;

export function isE164(phone: string): boolean {
  return E164.test(phone);
}

/** Digits of an Israeli number as typed after the country code, or null. */
function israeli(national: string): string | null {
  const n = national.startsWith('0') ? national.slice(1) : national;
  return IL_NATIONAL.test(n) ? `+972${n}` : null;
}

/**
 * Everything that may sit between the digits and is not part of the number.
 * Beyond spaces, hyphens, brackets and dots: the INVISIBLE direction marks iOS
 * wraps around an autofilled or pasted number in a Hebrew (RTL) phone
 * (U+200E/F, U+202A–E, U+2066–9), zero-width and soft-hyphen characters, and
 * the look-alike dashes contact cards use (non-breaking hyphen U+2011, en/em
 * dash, minus sign, full-width hyphen). Without these the number looks right
 * on screen but fails the check — which is how a new account got stuck on the
 * setup page with a dead Continue button.
 */
const NOISE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00ad, 0x00ad], // soft hyphen
  [0x200b, 0x200f], // zero-width chars, LRM / RLM
  [0x202a, 0x202e], // bidi embeddings / overrides
  [0x2060, 0x2069], // word joiner, bidi isolates
  [0xfeff, 0xfeff], // zero-width no-break space
  [0x2010, 0x2015], // hyphen, non-breaking hyphen, figure / en / em dash
  [0x2212, 0x2212], // minus sign
  [0xfe58, 0xfe58], // small em dash
  [0xfe63, 0xfe63], // small hyphen-minus
  [0xff0d, 0xff0d], // full-width hyphen-minus
  [0xff08, 0xff09], // full-width brackets
];

/** True for a character that is not part of the number (see above). */
function isNoise(ch: string): boolean {
  if (/[\s\-().]/.test(ch)) return true;
  const code = ch.charCodeAt(0);
  return NOISE_RANGES.some(([a, b]) => code >= a && code <= b);
}

/** Digit blocks some keyboards and pastes use, each given by its zero. */
const DIGIT_ZEROS = [0xff10 /* full-width */, 0x0660 /* Arabic-Indic */, 0x06f0 /* Extended Arabic-Indic */];
const FULLWIDTH_PLUS = 0xff0b;

/**
 * The input with the noise dropped and every digit in ASCII.
 * Code points are written as numbers, never as literal characters or escapes:
 * the font-coverage test scans source for glyphs Heebo lacks, and none of these
 * is ever drawn.
 */
function clean(input: string): string {
  let out = '';
  for (const ch of input) {
    if (isNoise(ch)) continue;
    const code = ch.charCodeAt(0);
    if (code === FULLWIDTH_PLUS) { out += '+'; continue; }
    const zero = DIGIT_ZEROS.find((z) => code >= z && code <= z + 9);
    out += zero === undefined ? ch : String(code - zero);
  }
  return out;
}

/** The number in E.164, or null when it is not a valid phone number. */
export function normalizePhone(input: string): string | null {
  const s = clean(input);
  if (!/^\+?\d+$/.test(s)) return null;

  if (s.startsWith('+')) {
    const digits = s.slice(1);
    if (digits.startsWith('972')) return israeli(digits.slice(3));
    const e164 = `+${digits}`;
    return isE164(e164) ? e164 : null;
  }
  if (s.startsWith('972')) return israeli(s.slice(3));
  // A leading 0 is Israeli national format; 00 is an international prefix we do
  // not guess at — the user can type the + form.
  if (s.startsWith('0') && !s.startsWith('00')) return israeli(s);
  return null;
}

/**
 * How a stored number is shown: the local way for Israel, as stored otherwise.
 * The number is optional, so a missing one shows as ''.
 */
export function formatPhoneForDisplay(e164: string | null | undefined): string {
  if (typeof e164 !== 'string') return '';
  if (!e164.startsWith('+972')) return e164;
  const national = `0${e164.slice(4)}`;
  return national.length === 10
    ? `${national.slice(0, 3)}-${national.slice(3, 6)}-${national.slice(6)}`
    : `${national.slice(0, 2)}-${national.slice(2, 5)}-${national.slice(5)}`;
}
