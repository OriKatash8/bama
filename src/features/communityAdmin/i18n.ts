import { useColorScheme } from 'react-native';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { ADMIN_DARK, ADMIN_LIGHT, type AdminPalette } from './theme';

type Translations = typeof en;
export type AdminT = (key: string, vars?: Record<string, string | number>) => string;

function makeT(translations: Translations): AdminT {
  return (key, vars) => {
    let result: unknown = translations;
    for (const k of key.split('.')) result = (result as Record<string, unknown>)?.[k];
    let str = typeof result === 'string' ? result : key;
    if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{{${k}}}`, String(v));
    return str;
  };
}

/** `t` scoped to `community_admin.*`, plus the direction helpers every row needs. */
export function useAdminT() {
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  const base = makeT(rtl ? he : en);
  const t: AdminT = (key, vars) => base(`community_admin.${key}`, vars);
  return {
    t,
    rtl,
    lang: (rtl ? 'he' : 'en') as 'he' | 'en',
    rowDir: (rtl ? 'row-reverse' : 'row') as 'row' | 'row-reverse',
    textAlign: (rtl ? 'right' : 'left') as 'right' | 'left',
  };
}

/** The dashboard follows the device scheme; the rest of the app stays light. */
export function useAdminPalette(): AdminPalette {
  return useColorScheme() === 'dark' ? ADMIN_DARK : ADMIN_LIGHT;
}

const DAY_MS = 86_400_000;

/** "today" / "yesterday" / "N days ago" / "Nmo ago", by local calendar day. */
export function ago(t: AdminT, at: Date, now: Date): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(at)) / DAY_MS);
  if (days <= 0) return t('ago_today');
  if (days === 1) return t('ago_yesterday');
  if (days < 60) return t('ago_days', { n: days });
  return t('ago_months', { n: Math.floor(days / 30) });
}
