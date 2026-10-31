import type { TextStyle } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { familyFor, scriptOf, type Script } from '../theme/fonts';

type Weight = 'regular' | 'medium' | 'semiBold' | 'bold' | 'light';

/**
 * `fontWeight` is deliberately absent: each weight is its own static family
 * (Heebo-Bold, Montserrat-SemiBold …), so adding a fontWeight on top would make
 * Android synthesize bold over an already-bold face. `fontWeight` stays in the
 * type only because callers spread this into styles that may add their own,
 * which AppText / Text then resolve (see src/core/theme/fonts.ts).
 */
export type FontStyle = { fontFamily: string; fontWeight?: TextStyle['fontWeight'] };

const WEIGHT_NUMBER: Record<Weight, number> = { light: 300, regular: 400, medium: 500, semiBold: 600, bold: 700 };

function table(script: Script): Record<Weight, FontStyle> {
  const make = (w: Weight): FontStyle => ({ fontFamily: familyFor(script, WEIGHT_NUMBER[w]) });
  return { regular: make('regular'), medium: make('medium'), semiBold: make('semiBold'), bold: make('bold'), light: make('light') };
}

const HE_FONTS = table('he');
const EN_FONTS = table('en');

export function useAppFont() {
  const language = useSettingsStore((s) => s.language);
  const isHe = language === 'he';
  const appFonts = isHe ? HE_FONTS : EN_FONTS;

  function forText(text: string, weight: Weight = 'regular'): FontStyle {
    return scriptOf(text) === 'he' ? HE_FONTS[weight] : EN_FONTS[weight];
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
