import type { TextStyle } from 'react-native';

/**
 * The app's two type families, as STATIC font files registered one family per
 * weight (see src/app/_layout.tsx): Heebo for Hebrew, Montserrat for Latin.
 *
 * WHY NOT ONE VARIABLE FONT + fontWeight. That is what Montserrat used to be, and
 * it only works on iOS. Android loads a custom font file as a single face and
 * never applies `fontWeight` to a variable axis, so every English string drew at
 * the file's default instance — Thin (wght 100) for the Montserrat we shipped.
 * A static family per weight needs no axis: the weight is in the family name, on
 * both platforms. It also means NO `fontWeight` may travel with these families:
 * on Android it would be applied on top of an already-bold face as synthetic bold.
 */
export type Script = 'he' | 'en';

const HEEBO: Record<number, string> = {
  100: 'Heebo-Thin', 200: 'Heebo-ExtraLight', 300: 'Heebo-Light', 400: 'Heebo-Regular',
  500: 'Heebo-Medium', 600: 'Heebo-SemiBold', 700: 'Heebo-Bold', 800: 'Heebo-ExtraBold', 900: 'Heebo-Black',
};

/** Montserrat ships Light–Black; Thin and ExtraLight are not bundled, so they use Light. */
const MONTSERRAT: Record<number, string> = {
  100: 'Montserrat-Light', 200: 'Montserrat-Light', 300: 'Montserrat-Light', 400: 'Montserrat-Regular',
  500: 'Montserrat-Medium', 600: 'Montserrat-SemiBold', 700: 'Montserrat-Bold', 800: 'Montserrat-ExtraBold', 900: 'Montserrat-Black',
};

const HEBREW_RE = /[֐-׿]/;

/** Hebrew letters pick Heebo, everything else Montserrat. */
export function scriptOf(text: string): Script {
  return HEBREW_RE.test(text) ? 'he' : 'en';
}

/** 'normal' → 400, 'bold' → 700, '600' / 600 → 600, rounded to the nearest 100 and clamped to 100–900. */
export function weightNumber(fontWeight: TextStyle['fontWeight'] | undefined): number {
  if (fontWeight === undefined || fontWeight === 'normal') return 400;
  if (fontWeight === 'bold') return 700;
  const n = Number(fontWeight);
  if (!Number.isFinite(n)) return 400;
  return Math.min(900, Math.max(100, Math.round(n / 100) * 100));
}

export function familyFor(script: Script, weight: number): string {
  const table = script === 'he' ? HEEBO : MONTSERRAT;
  return table[Math.min(900, Math.max(100, Math.round(weight / 100) * 100))] ?? table[400];
}

/** One of OUR static families (Heebo-Bold, Montserrat-SemiBold …), as opposed to a system or other font. */
export function isBrandFamily(name: string | undefined): boolean {
  return !!name && /^(Heebo|Montserrat)-[A-Za-z]+$/.test(name);
}

/** Inverse of familyFor: the script a brand family belongs to. */
function scriptOfFamily(name: string): Script {
  return name.startsWith('Heebo') ? 'he' : 'en';
}

/**
 * What a `Text` / `TextInput` must add to its own style so that it renders in the
 * right static face on both platforms. Returns only the keys to override (and
 * `fontWeight: undefined` to cancel one that would double up on a static face).
 *
 *  - another font entirely (PeaceSans, a system font): left alone.
 *  - an explicit weight, with or without one of our families: the face for that
 *    weight in the family's script — so `{...font.bold, fontWeight: '800'}` is
 *    ExtraBold, as it was on iOS with the variable font.
 *  - one of our families and no weight: as given.
 *  - nothing: the script of the text, regular.
 */
export function resolveTextStyle(flat: TextStyle, text: string): TextStyle {
  const { fontFamily, fontWeight } = flat;
  if (fontFamily && !isBrandFamily(fontFamily)) return {};
  const script = fontFamily ? scriptOfFamily(fontFamily) : scriptOf(text);
  if (fontWeight !== undefined) return { fontFamily: familyFor(script, weightNumber(fontWeight)), fontWeight: undefined };
  if (fontFamily) return {};
  return { fontFamily: familyFor(script, 400) };
}
