import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './translations/en.json';
import he from './translations/he.json';

const getInitialLanguage = (): string => {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('bama-settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed?.state?.language ?? 'he';
      }
    }
  } catch {
    // ignore
  }
  return 'he';
};

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    he: { translation: he },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  initImmediate: false,
});

export default i18n;
