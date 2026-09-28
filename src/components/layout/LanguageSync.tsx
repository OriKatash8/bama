import { useEffect } from 'react';
import i18n from '@core/i18n';
import { useSettingsStore } from '@core/stores/settingsStore';

/**
 * Keeps i18next on the store's language. The in-app switchers only set the
 * store, so this applies it at mount and then follows every change.
 */
export function LanguageSync() {
  useEffect(() => {
    i18n.changeLanguage(useSettingsStore.getState().language);
    return useSettingsStore.subscribe((state, prev) => {
      if (state.language !== prev.language) i18n.changeLanguage(state.language);
    });
  }, []);

  return null;
}
