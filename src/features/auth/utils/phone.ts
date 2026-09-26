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

/** The number in E.164, or null when it is not a valid phone number. */
export function normalizePhone(input: string): string | null {
  const s = input.replace(/[\s\-().]/g, '');
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

/** How a stored number is shown: the local way for Israel, as stored otherwise. */
export function formatPhoneForDisplay(e164: string): string {
  if (!e164.startsWith('+972')) return e164;
  const national = `0${e164.slice(4)}`;
  return national.length === 10
    ? `${national.slice(0, 3)}-${national.slice(3, 6)}-${national.slice(6)}`
    : `${national.slice(0, 2)}-${national.slice(2, 5)}-${national.slice(5)}`;
}
