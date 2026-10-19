import { QUOTA_WARN_FRACTION } from '@core/constants/usageQuotas';

/** 12,345 */
export function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

/** 1.5 GB / 64.2 MB / 12 KB / 0 B (binary units, one decimal under 100). */
export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = Math.max(0, n);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  const text = i === 0 || v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '');
  return `${text} ${units[i]}`;
}

export type QuotaLevel = 'ok' | 'warn' | 'bad';

/** Used / quota as a 0..1+ fraction (not clamped), and the colour band it falls in. */
export function quotaFraction(used: number | null | undefined, quota: number): number {
  if (used == null || !Number.isFinite(used) || quota <= 0) return 0;
  return used / quota;
}
export function quotaLevel(fraction: number): QuotaLevel {
  return fraction >= 1 ? 'bad' : fraction >= QUOTA_WARN_FRACTION ? 'warn' : 'ok';
}

/** "10:00" for the quota reset hour reported by the server. */
export function formatResetHour(hour: number, minute = 0): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(hour)}:${p(minute)}`;
}
