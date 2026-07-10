import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import i18n from '@core/i18n';
import { useSettingsStore } from '@core/stores/settingsStore';

export function LanguageSync() {
  useEffect(() => {
    const lang = useSettingsStore.getState().language;
    console.log('[LanguageSync] language from store:', lang);
    console.log('[LanguageSync] current i18n.language:', i18n.language);
    i18n.changeLanguage(lang);
    console.log('[LanguageSync] i18n.language after change:', i18n.language);
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(lang === 'he');
  }, []);

  return null;
}
