const HE_MONTHS_ABBR = ['ינו׳','פבר׳','מרץ','אפר׳','מאי','יוני','יולי','אוג׳','ספט׳','אוק׳','נוב׳','דצמ׳'];

/** Turn a "…{title} · YYYY-MM-DD HH:MM" system text into a nice Hebrew detail line.
 *  The hour is optional on a meeting; without one the line is just the date. */
export function formatHebMeetingDetail(text: string): string {
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}:\d{2}))?/);
  const formattedDate = m
    ? `${parseInt(m[3], 10)} ב${HE_MONTHS_ABBR[parseInt(m[2], 10) - 1] ?? ''}${m[4] ? `, ${m[4]}` : ''}`
    : '';
  const title = text.replace(/^📅\s*פגישה חדשה:\s*/, '').split(' · ')[0]?.trim();
  if (title && formattedDate) return `${title} · ${formattedDate}`;
  return formattedDate || title || '';
}
