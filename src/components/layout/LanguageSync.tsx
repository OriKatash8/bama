import { useEffect } from 'react';
import i18n from '@core/i18n';
import { useSettingsStore } from '@core/stores/settingsStore';

export function LanguageSync() {
  useEffect(() => {
    const lang = useSettingsStore.getState().language;
    i18n.changeLanguage(lang);
  }, []);

  return null;
}
