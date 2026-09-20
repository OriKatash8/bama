const HE_MONTHS_ABBR = ['ינו׳','פבר׳','מרץ','אפר׳','מאי','יוני','יולי','אוג׳','ספט׳','אוק׳','נוב׳','דצמ׳'];
const EN_MONTHS_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Turn a "…{title} · YYYY-MM-DD HH:MM" system text into a nice detail line, in
 *  the reader's language. The system text itself is always written in Hebrew —
 *  only the date is rewritten; the meeting's title is the author's own words.
 *  The hour is optional on a meeting; without one the line is just the date. */
export function formatMeetingDetail(text: string, lang: 'he' | 'en' = 'he'): string {
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}:\d{2}))?/);
  const day = m ? parseInt(m[3], 10) : 0;
  const month = m ? parseInt(m[2], 10) - 1 : -1;
  const hour = m?.[4] ? `, ${m[4]}` : '';
  const formattedDate = m
    ? lang === 'en'
      ? `${EN_MONTHS_ABBR[month] ?? ''} ${day}${hour}`
      : `${day} ב${HE_MONTHS_ABBR[month] ?? ''}${hour}`
    : '';
  const title = text.replace(/^📅\s*פגישה חדשה:\s*/, '').split(' · ')[0]?.trim();
  if (title && formattedDate) return `${title} · ${formattedDate}`;
  return formattedDate || title || '';
}
