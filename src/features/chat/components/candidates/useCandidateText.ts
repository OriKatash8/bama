import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Vars = Record<string, string | number>;

/** Translation + direction for the candidate review surfaces. */
export function useCandidateText() {
  const language = useSettingsStore((s) => s.language);
  const lang: 'he' | 'en' = language === 'he' ? 'he' : 'en';
  const table = lang === 'he' ? he : en;
  const t = (key: string, vars?: Vars): string => {
    let result: unknown = table;
    for (const k of key.split('.')) result = (result as Record<string, unknown>)?.[k];
    if (typeof result !== 'string') return key;
    return vars ? result.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? '')) : result;
  };
  const rtl = lang === 'he';
  return {
    t,
    lang,
    rtl,
    align: (rtl ? 'right' : 'left') as 'right' | 'left',
    /**
     * Put on every line that interpolates a NAME. Without it the browser takes
     * the line's direction from its first strong character — so "{name} proposed
     * a new price" with a Hebrew name renders right-to-left inside an English UI
     * (and an English name scrambles a Hebrew line the same way).
     */
    dir: { writingDirection: (rtl ? 'rtl' : 'ltr') as 'rtl' | 'ltr' },
    rowDir: (rtl ? 'row-reverse' : 'row') as 'row-reverse' | 'row',
    money: (n: number) => `₪${Number(n || 0).toLocaleString()}`,
  };
}
