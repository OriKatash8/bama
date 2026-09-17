import { repriceErrorKey } from '../repriceErrors';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

const err = (message: string) => ({ message });
const lookup = (tr: unknown, key: string) =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], tr);

describe('repriceErrorKey', () => {
  it.each([
    ['offer-price-out-of-range', 'project_details.reprice_out_of_range'],
    ['price-change-pending', 'project_details.reprice_pending'],
    ['counter-not-allowed', 'project_details.reprice_counter_not_allowed'],
    ['no-accepted-offer-to-reprice', 'project_details.reprice_no_offer'],
    ['no-accepted-bundle-to-reprice', 'project_details.reprice_no_offer'],
    ['professional-not-on-project', 'project_details.reprice_not_a_party'],
    ['something else', 'project_details.error_payment_request'],
  ])('create: %s → %s', (message, key) => {
    expect(repriceErrorKey(err(message), 'create')).toBe(key);
  });

  it('respond: an out-of-range amount says it cannot be accepted; anything else is generic', () => {
    expect(repriceErrorKey(err('offer-price-out-of-range'), 'respond')).toBe('chats_page.hire_price_invalid');
    expect(repriceErrorKey(err('Request is not pending'), 'respond')).toBe('project_details.error_accept_reject');
  });

  it('every key it can return exists in both languages', () => {
    const keys = new Set<string>();
    for (const m of ['offer-price-out-of-range', 'price-change-pending', 'counter-not-allowed',
      'no-accepted-offer-to-reprice', 'not-a-party', 'x']) {
      keys.add(repriceErrorKey(err(m), 'create'));
      keys.add(repriceErrorKey(err(m), 'respond'));
    }
    for (const key of keys) {
      expect(typeof lookup(en, key)).toBe('string');
      expect(typeof lookup(he, key)).toBe('string');
    }
  });
});
