/** The brand lists use the literal 'Other' as a sentinel (it opens the custom
 *  brand input on the post sheet and is the catch-all filter option), so the
 *  value stays English everywhere — only its label is translated. */
export function brandLabel(brand: string, lang: 'he' | 'en'): string {
  return lang === 'he' && brand === 'Other' ? 'אחר' : brand;
}
