import { useSettingsStore } from '../stores/settingsStore';

type Weight = 'regular' | 'medium' | 'semiBold' | 'bold' | 'light';

const HE_FONTS: Record<Weight, string> = {
  regular:  'Heebo-Regular',
  medium:   'Heebo-Medium',
  semiBold: 'Heebo-SemiBold',
  bold:     'Heebo-Bold',
  light:    'Heebo-Light',
};

const EN_FONTS: Record<Weight, string> = {
  regular:  'Montserrat-Regular',
  medium:   'Montserrat-Medium',
  semiBold: 'Montserrat-SemiBold',
  bold:     'Montserrat-Bold',
  light:    'Montserrat-Light',
};

const HEBREW_RE = /[֐-׿]/;

export function useAppFont() {
  const language = useSettingsStore((s) => s.language);
  const isHe = language === 'he';
  const appFonts = isHe ? HE_FONTS : EN_FONTS;

  function forText(text: string, weight: Weight = 'regular'): string {
    return HEBREW_RE.test(text) ? HE_FONTS[weight] : EN_FONTS[weight];
  }

  return {
    regular:  appFonts.regular,
    medium:   appFonts.medium,
    semiBold: appFonts.semiBold,
    bold:     appFonts.bold,
    light:    appFonts.light,
    forText,
  };
}
