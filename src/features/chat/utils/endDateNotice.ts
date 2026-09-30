import { AUTO_CLOSE_GRACE_DAYS } from '@core/constants/pricing';

const DAY_MS = 86400_000;

/** A local Date as an ISO day ('2026-10-07'), for formatShortDay. */
function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Whether a project chat shows the "closes 2 days after the end date" banner.
 *
 * Mirrors the server's auto-close (functions/src/lifecycle/autoClose.ts): a live
 * project with at least one hired pro closes AUTO_CLOSE_GRACE_DAYS after its
 * `endDate` (local midnight of the chosen day). Shown from one day before the
 * end date until then. A project with no hires never auto-closes, so it gets no
 * banner either.
 */
export function endDateNotice(p: {
  endDate: Date | undefined;
  status: string | undefined;
  hasHires: boolean;
  now: Date;
}): { show: boolean; closesOn?: string } {
  if (!p.endDate || !p.hasHires) return { show: false };
  if (p.status !== 'open' && p.status !== 'in_progress') return { show: false };
  const end = p.endDate.getTime();
  const closesAt = new Date(end + AUTO_CLOSE_GRACE_DAYS * DAY_MS);
  const now = p.now.getTime();
  const show = now >= end - DAY_MS && now < closesAt.getTime();
  return show ? { show, closesOn: isoDay(closesAt) } : { show: false };
}
