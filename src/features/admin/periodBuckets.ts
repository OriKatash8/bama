/** The admin charts' time scales. */
export type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

const sec = (d: Date) => Math.floor(d.getTime() / 1000);

/**
 * The chart's buckets, oldest → newest: each bucket's start (unix seconds,
 * local time), the exclusive end of the last one, and the axis labels. Each
 * scale is a window ending now:
 * daily = last 24 hours (hourly), weekly = last 7 days (daily),
 * monthly = last 30 days (daily), yearly = last 12 months (calendar months).
 * Dates are built from calendar fields, so a DST change never shifts a bucket.
 */
export function periodBuckets(period: Period, now: Date, locale: string) {
  const y = now.getFullYear();
  const mo = now.getMonth();
  const d = now.getDate();
  const h = now.getHours();

  let count: number;
  let at: (k: number) => Date; // bucket k's start; k = count is the window's end
  let label: (start: Date) => string;

  if (period === 'daily') {
    count = 24;
    at = (k) => new Date(y, mo, d, h - (count - 1) + k);
    label = (s) => `${String(s.getHours()).padStart(2, '0')}:00`;
  } else if (period === 'yearly') {
    count = 12;
    at = (k) => new Date(y, mo - (count - 1) + k, 1);
    label = (s) => s.toLocaleDateString(locale, { month: 'short' });
  } else {
    count = period === 'weekly' ? 7 : 30;
    at = (k) => new Date(y, mo, d - (count - 1) + k);
    label =
      period === 'weekly'
        ? (s) => s.toLocaleDateString(locale, { weekday: 'short' })
        : (s) => s.toLocaleDateString(locale, { day: 'numeric', month: 'numeric' });
  }

  const starts: number[] = [];
  const labels: string[] = [];
  for (let k = 0; k < count; k++) {
    const s = at(k);
    starts.push(sec(s));
    labels.push(label(s));
  }
  return { starts, end: sec(at(count)), labels };
}
