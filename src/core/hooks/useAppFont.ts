import type { TextStyle } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';

type Weight = 'regular' | 'medium' | 'semiBold' | 'bold' | 'light';

export type FontStyle = { fontFamily: string; fontWeight?: TextStyle['fontWeight'] };

const HE_FONTS: Record<Weight, FontStyle> = {
  regular:  { fontFamily: 'Heebo-Regular' },
  medium:   { fontFamily: 'Heebo-Medium' },
  semiBold: { fontFamily: 'Heebo-SemiBold' },
  bold:     { fontFamily: 'Heebo-Bold' },
  light:    { fontFamily: 'Heebo-Light' },
};

const EN_FONTS: Record<Weight, FontStyle> = {
  regular:  { fontFamily: 'Montserrat', fontWeight: '400' },
  medium:   { fontFamily: 'Montserrat', fontWeight: '500' },
  semiBold: { fontFamily: 'Montserrat', fontWeight: '600' },
  bold:     { fontFamily: 'Montserrat', fontWeight: '700' },
  light:    { fontFamily: 'Montserrat', fontWeight: '300' },
};

const HEBREW_RE = /[֐-׿]/;

export function useAppFont() {
  const language = useSettingsStore((s) => s.language);
  const isHe = language === 'he';
  const appFonts = isHe ? HE_FONTS : EN_FONTS;

  function forText(text: string, weight: Weight = 'regular'): FontStyle {
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
