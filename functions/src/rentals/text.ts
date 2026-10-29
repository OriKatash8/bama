/** Text clean-up for store data: WordPress sends names and descriptions HTML-escaped. */

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  times: '×', prime: '′', Prime: '″', deg: '°', shekel: '₪', laquo: '«', raquo: '»',
  copy: '©', reg: '®', trade: '™', middot: '·', bull: '•',
};

function fromCodePoint(n: number): string {
  // Invalid code points (and NUL) would throw or plant control characters.
  if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return '';
  return String.fromCodePoint(n);
}

/** Decodes &quot; &#8211; &#x2032; … Unknown named entities are left as written. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      return fromCodePoint(parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10));
    }
    return NAMED[body] ?? NAMED[body.toLowerCase()] ?? whole;
  });
}

/** HTML to plain text: block tags become line breaks, everything else is dropped. */
export function stripHtml(html: string): string {
  const text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');
  return decodeEntities(text)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Cut at a word boundary near `max`, with an ellipsis. */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** A one-line, decoded, bounded name. */
export function cleanName(raw: string, max: number): string {
  return truncate(stripHtml(raw).replace(/\s+/g, ' ').trim(), max);
}
