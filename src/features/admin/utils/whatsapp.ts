/**
 * WhatsApp deep links for the admin "recently blocked" list.
 *
 * `wa.me` wants the number in full international form with no `+`, spaces or
 * leading zeros: an Israeli `050-123-4567` is `972501234567`.
 */

/** The number in wa.me form (972…), or null when it cannot be an Israeli number. */
export function whatsappPhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00972')) digits = digits.slice(2);
  if (digits.startsWith('972')) {
    digits = digits.slice(3);
    // "+972 (0)50…" is written with a stray zero by some people.
    if (digits.startsWith('0')) digits = digits.slice(1);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  } else {
    return null;
  }
  // Israeli numbers after the country code: 8 digits (landline) or 9 (mobile).
  if (digits.length < 8 || digits.length > 9) return null;
  return `972${digits}`;
}

/** `https://wa.me/972…?text=…` with the Hebrew text percent-encoded, or null. */
export function whatsappLink(rawPhone: unknown, text: string): string | null {
  const phone = whatsappPhone(rawPhone);
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : null;
}
