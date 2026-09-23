import en from '../translations/en.json';
import he from '../translations/he.json';

/**
 * THE CHARGE HAS ONE NAME: A BROKERAGE FEE. SO DOES WHAT IS OWED OF IT.
 *
 * The charge used to be called three things in three places — "BAMA fee" (the
 * company, not the charge), "Platform fee", and "עמלת פלטפורמה" — so a
 * professional met a different name on the offer notice, the completion sheet,
 * the project details and the pricing screen. The running total of unpaid fees
 * was a fourth, "BAMA balance", which named the company again. It is a
 * brokerage balance: fees of one name add up to a balance of the same name.
 *
 * BAMA itself is untouched where it is genuinely the company and not money:
 * system messages, who a community-deletion request goes to, and who
 * paid_to_bama says the money is paid TO.
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

/** Keys that name the company rather than the money, and stay as they are. */
const COMPANY_KEYS = [
  // The money is paid TO BAMA — that is a fact about the recipient, not a name
  // for the charge, so only its "platform services" became "brokerage
  // services".
  'project_details.paid_to_bama',
];

/** The two places the running total of unpaid fees is named. */
const BALANCE_KEYS = ['balance.title', 'project_details.pay_fee'];

describe('fee vocabulary', () => {
  it.each([['en', EN], ['he', HE]] as const)('%s calls no charge a "BAMA fee"', (_lang, list) => {
    const offenders = list.filter(([, v]) => /bama fee/i.test(v) || v.includes('עמלת BAMA'));
    expect(offenders).toEqual([]);
  });

  it.each([['en', EN], ['he', HE]] as const)('%s calls no charge a "platform fee"', (_lang, list) => {
    const offenders = list.filter(([, v]) => /platform fees?/i.test(v) || /עמל(ת|ות) פלטפורמה/.test(v));
    expect(offenders).toEqual([]);
  });

  it.each([['en', EN], ['he', HE]] as const)('%s calls no balance a "BAMA balance"', (_lang, list) => {
    const offenders = list.filter(([, v]) => /bama balance/i.test(v) || /יתר(ה|ת) ל-?BAMA/.test(v));
    expect(offenders).toEqual([]);
  });

  it('names the balance after the same thing the fees are named after', () => {
    for (const key of BALANCE_KEYS) {
      expect(EN.find(([k]) => k === key)![1]).toBe('Brokerage balance');
      expect(HE.find(([k]) => k === key)![1]).toBe('יתרת תיווך');
    }
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

  it('leaves BAMA where BAMA is the company, not the money', () => {
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
