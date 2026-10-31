import { resolveConfig, CONFIG_DEFAULTS } from '../../pricing';
import { isPaymentsEnabledFor, parseTestUids } from '../guard';
import { getProvider, getWebhookProvider } from '../getProvider';
import { fakeOutcomeFor, parseFakeWebhook } from '../fakeProvider';
import { growProvider } from '../growProvider';

jest.mock('../../lifecycle/helpers', () => ({ db: {}, FieldValue: {} }));
jest.mock('../../lifecycle/config', () => ({ readConfig: async () => ({}) }));

describe('payment config keys', () => {
  it('default to the unchanged behaviour', () => {
    expect(CONFIG_DEFAULTS.paymentProvider).toBe('none');
    expect(CONFIG_DEFAULTS.chargeMaxAttempts).toBe(3);
    expect(CONFIG_DEFAULTS.chargeRetryHours).toBe(24);
    expect(resolveConfig(null).paymentProvider).toBe('none');
  });
  it('accepts only an exact provider name', () => {
    expect(resolveConfig({ paymentProvider: 'fake' }).paymentProvider).toBe('fake');
    expect(resolveConfig({ paymentProvider: 'grow' }).paymentProvider).toBe('grow');
    for (const bad of ['GROW', 'stripe', 1, true, null, undefined, ['grow']]) {
      expect(resolveConfig({ paymentProvider: bad }).paymentProvider).toBe('none');
    }
  });
  it('takes positive numbers for attempts and retry hours, falls back otherwise', () => {
    const c = resolveConfig({ chargeMaxAttempts: 5, chargeRetryHours: 6 });
    expect([c.chargeMaxAttempts, c.chargeRetryHours]).toEqual([5, 6]);
    const d = resolveConfig({ chargeMaxAttempts: 0, chargeRetryHours: -1 });
    expect([d.chargeMaxAttempts, d.chargeRetryHours]).toEqual([3, 24]);
  });
});

describe('isPaymentsEnabledFor / getProvider', () => {
  const testers = ['tester'];
  const cfg = (paymentProvider: 'none' | 'fake' | 'grow') => ({ paymentProvider, paymentTestUids: testers });

  it("'none' is off for everyone, emulator included", () => {
    expect(isPaymentsEnabledFor(cfg('none'), 'tester', true)).toBe(false);
    expect(getProvider(cfg('none'), { professionalId: 'tester' }, true)).toBeNull();
  });
  it("'fake' runs only for testers, or under the emulator", () => {
    expect(isPaymentsEnabledFor(cfg('fake'), 'tester', false)).toBe(true);
    expect(isPaymentsEnabledFor(cfg('fake'), 'real-pro', false)).toBe(false);
    expect(isPaymentsEnabledFor(cfg('fake'), 'real-pro', true)).toBe(true);
    expect(getProvider(cfg('fake'), { professionalId: 'real-pro' }, false)).toBeNull();
    expect(getProvider(cfg('fake'), { professionalId: 'tester' }, false)?.name).toBe('fake');
  });
  it("'grow' is on for everyone", () => {
    expect(getProvider(cfg('grow'), { professionalId: 'anyone' }, false)).toBe(growProvider);
  });
  it('the webhook provider follows only the master switch', () => {
    expect(getWebhookProvider({ paymentProvider: 'none' })).toBeNull();
    expect(getWebhookProvider({ paymentProvider: 'fake' })?.name).toBe('fake');
  });
  it('parseTestUids ignores anything that is not a list of strings', () => {
    expect(parseTestUids({ paymentTestUids: ['a', '', 3, 'b'] })).toEqual(['a', 'b']);
    expect(parseTestUids({ paymentTestUids: 'a' })).toEqual([]);
    expect(parseTestUids(null)).toEqual([]);
  });
});

describe('fake provider', () => {
  it('chooses the outcome by token', () => {
    expect(fakeOutcomeFor('tok_ok').outcome).toBe('succeeded');
    expect(fakeOutcomeFor('tok_retry')).toMatchObject({ outcome: 'failed', failureClass: 'retryable' });
    expect(fakeOutcomeFor('tok_dead')).toMatchObject({ outcome: 'failed', failureClass: 'final' });
    expect(fakeOutcomeFor('tok_pending').outcome).toBe('pending');
    expect(fakeOutcomeFor('garbage')).toMatchObject({ outcome: 'failed', failureClass: 'final' });
  });
  it('parses its webhook and rejects junk', () => {
    expect(parseFakeWebhook({ providerEventId: 'e1', type: 'charge', idempotencyKey: 'k', outcome: 'succeeded' }))
      .toMatchObject({ type: 'charge', idempotencyKey: 'k', outcome: 'succeeded' });
    expect(parseFakeWebhook({ type: 'charge' })).toBeNull();
    expect(parseFakeWebhook(null)).toBeNull();
  });
  it('the grow placeholder throws on every method', async () => {
    await expect(growProvider.createCardSaveSession('u')).rejects.toThrow('not implemented');
    await expect(growProvider.chargeToken({} as never)).rejects.toThrow('not implemented');
  });
});
