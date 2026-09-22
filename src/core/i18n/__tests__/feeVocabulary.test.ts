import en from '../translations/en.json';
import he from '../translations/he.json';

/**
 * THE CHARGE HAS ONE NAME: A BROKERAGE FEE.
 *
 * It used to be called three things in three places — "BAMA fee" (the company,
 * not the charge), "Platform fee", and "עמלת פלטפורמה" — so a professional met
 * a different name on the offer notice, the completion sheet, the project
 * details and the pricing screen. This holds the whole vocabulary swept rather
 * than one screen at a time.
 *
 * BAMA itself is untouched where it is genuinely the company: system messages,
 * the balance owed TO it, who a community-deletion request goes to.
 */

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** Every string in a translation file, with its dotted key. */
function entries(node: Json, path = ''): [string, string][] {
  if (typeof node === 'string') return [[path, node]];
  if (Array.isArray(node)) return node.flatMap((v, i) => entries(v, `${path}[${i}]`));
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => entries(v as Json, path ? `${path}.${k}` : k));
  }
  return [];
}

const EN = entries(en as unknown as Json);
const HE = entries(he as unknown as Json);

/** Keys that name the company rather than the charge, and stay as they are. */
const COMPANY_KEYS = [
  'balance.title',              // the balance owed TO BAMA, not a fee name
  'project_details.pay_fee',    // ditto
  'project_details.paid_to_bama',
];

describe('fee vocabulary', () => {
  it.each([['en', EN], ['he', HE]] as const)('%s calls no charge a "BAMA fee"', (_lang, list) => {
    const offenders = list.filter(([, v]) => /bama fee/i.test(v) || v.includes('עמלת BAMA'));
    expect(offenders).toEqual([]);
  });

  it.each([['en', EN], ['he', HE]] as const)('%s calls no charge a "platform fee"', (_lang, list) => {
    const offenders = list.filter(([, v]) => /platform fees?/i.test(v) || /עמל(ת|ות) פלטפורמה/.test(v));
    expect(offenders).toEqual([]);
  });

  it('names the charge the same way on every screen that states it', () => {
    expect(en.project_details.fee_line).toContain('Brokerage fee');
    expect(en.project_details.fee_line_min).toContain('Brokerage fee');
    expect(en.project_details.fee_paid).toContain('Brokerage fee');
    expect(en.project_details.platform_fee).toBe('Brokerage fee');
    expect(en.pricing.fee_headline).toContain('Brokerage fee');
    expect(en.hire.fee_notice).toContain('Brokerage fee');
    expect(en.engagement.complete_fee).toContain('Brokerage fee');

    for (const s of [he.project_details.fee_line, he.project_details.fee_line_min,
                     he.project_details.fee_paid, he.pricing.fee_headline,
                     he.hire.fee_notice, he.engagement.complete_fee]) {
      expect(s).toContain('תיווך');
    }
    expect(he.project_details.platform_fee).toBe('עמלת תיווך');
  });

  it('leaves BAMA where BAMA is the company, not the charge', () => {
    for (const key of COMPANY_KEYS) {
      const found = EN.find(([k]) => k === key);
      expect(found).toBeDefined();
      expect(found![1]).toMatch(/BAMA/);
    }
    // System messages and support routing are about the company too.
    expect(en.chats.system_read_only).toMatch(/BAMA/);
    expect(en.communities.ask_delete_send).toMatch(/BAMA/);
  });

  it('keeps the two files in step — every key in one exists in the other', () => {
    expect(HE.map(([k]) => k).sort()).toEqual(EN.map(([k]) => k).sort());
  });
});
