import { resolveConfig } from '../../pricing';
import { isPaymentsEnabledFor, parseLinkAudience } from '../guard';
import { getProvider, getWebhookProvider, getLinkProvider } from '../getProvider';
import {
  buildMakeRequest, makeGrowLinkProvider, parseMakeResponse, type FetchLike,
} from '../growLinkProvider';
import { fakeLinkProvider } from '../fakeLinkProvider';

jest.mock('../../lifecycle/helpers', () => ({ db: {}, FieldValue: {} }));
jest.mock('../../lifecycle/config', () => ({ readConfig: async () => ({}) }));

const input = {
  feeKey: 'p1_u1', requestId: 'r1', projectId: 'p1', proId: 'u1', amount: 120,
  currency: 'ILS' as const, description: 'עמלת תיווך', payer: { fullName: 'A B', phone: '0501234567' },
};
const testers = { paymentTestUids: ['u1'] };

describe('link provider names and guard', () => {
  it('accepts the link names and rejects near-misses', () => {
    expect(resolveConfig({ paymentProvider: 'grow_link' }).paymentProvider).toBe('grow_link');
    expect(resolveConfig({ paymentProvider: 'fake_link' }).paymentProvider).toBe('fake_link');
    expect(resolveConfig({ paymentProvider: 'grow-link' }).paymentProvider).toBe('none');
  });
  it('audience defaults to testers; only the exact string all widens it', () => {
    expect(parseLinkAudience(null)).toBe('testers');
    expect(parseLinkAudience({ paymentLinkAudience: 'ALL' })).toBe('testers');
    expect(parseLinkAudience({ paymentLinkAudience: true })).toBe('testers');
    expect(parseLinkAudience({ paymentLinkAudience: 'all' })).toBe('all');
  });
  it('grow_link: testers only unless audience is all', () => {
    const c = { paymentProvider: 'grow_link' as const, ...testers };
    expect(isPaymentsEnabledFor(c, 'u1', false)).toBe(true);
    expect(isPaymentsEnabledFor(c, 'u2', false)).toBe(false);
    expect(isPaymentsEnabledFor({ ...c, paymentLinkAudience: 'testers' }, 'u2', false)).toBe(false);
    expect(isPaymentsEnabledFor({ ...c, paymentLinkAudience: 'all' }, 'u2', false)).toBe(true);
  });
  it('fake_link runs for anyone only under the emulator', () => {
    const c = { paymentProvider: 'fake_link' as const, ...testers };
    expect(isPaymentsEnabledFor(c, 'u2', true)).toBe(true);
    expect(isPaymentsEnabledFor(c, 'u2', false)).toBe(false);
    expect(isPaymentsEnabledFor(c, 'u1', false)).toBe(true);
  });
});

describe('getProvider vs getLinkProvider never both act', () => {
  it('link kinds give no token provider and no webhook provider', () => {
    for (const paymentProvider of ['grow_link', 'fake_link'] as const) {
      const c = { paymentProvider, ...testers };
      expect(getProvider(c, { professionalId: 'u1' }, true)).toBeNull();
      expect(getWebhookProvider(c)).toBeNull();
    }
  });
  it('token kinds give no link provider (none/fake/grow parity)', () => {
    for (const paymentProvider of ['none', 'fake', 'grow'] as const) {
      expect(getLinkProvider({ paymentProvider, ...testers }, { professionalId: 'u1' }, true)).toBeNull();
    }
  });
  it('picks by name and honours the audience', () => {
    expect(getLinkProvider({ paymentProvider: 'fake_link', ...testers }, { professionalId: 'u1' }, false))
      .toBe(fakeLinkProvider);
    expect(getLinkProvider({ paymentProvider: 'grow_link', ...testers }, { professionalId: 'u2' }, false))
      .toBeNull();
    expect(getLinkProvider({ paymentProvider: 'grow_link', ...testers }, { professionalId: 'u1' }, false)?.name)
      .toBe('grow_link');
  });
});

describe('Make create-link contract', () => {
  it('builds the documented request body', () => {
    expect(buildMakeRequest({ ...input, payer: { ...input.payer, email: 'a@b.co' } })).toEqual({
      requestId: 'r1', feeKey: 'p1_u1', projectId: 'p1', proId: 'u1', amount: 120, currency: 'ILS',
      description: 'עמלת תיווך', payer: { fullName: 'A B', phone: '0501234567', email: 'a@b.co' },
      customField1: 'p1_u1',
    });
    expect((buildMakeRequest(input).payer as object)).not.toHaveProperty('email');
  });
  it('parses a good reply, tolerating a numeric process id', () => {
    expect(parseMakeResponse({ ok: true, url: 'https://pay.example/x', paymentLinkProcessId: 77 }))
      .toEqual({ url: 'https://pay.example/x', processId: '77' });
  });
  it('rejects bad replies', () => {
    for (const bad of [null, {}, { ok: false, error: 'x' }, { url: 'http://x', paymentLinkProcessId: '1' },
      { url: 'https://x' }, { url: 'https://x', paymentLinkProcessId: '' }]) {
      expect(() => parseMakeResponse(bad)).toThrow();
    }
  });
  it('sends the secret header and throws on a non-200', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const ok: FetchLike = async (url, init) => {
      calls.push({ url, headers: init.headers });
      return { ok: true, status: 200, json: async () => ({ ok: true, url: 'https://p/x', paymentLinkProcessId: 'A' }) };
    };
    const p = makeGrowLinkProvider({ getUrl: () => 'https://make/hook', getSecret: () => 's3', fetchFn: ok });
    await expect(p.createPaymentLink(input)).resolves.toEqual({ url: 'https://p/x', processId: 'A' });
    expect(calls[0].headers['X-Bama-Secret']).toBe('s3');
    const bad: FetchLike = async () => ({ ok: false, status: 502, json: async () => ({}) });
    await expect(makeGrowLinkProvider({ getUrl: () => 'u', getSecret: () => 's', fetchFn: bad })
      .createPaymentLink(input)).rejects.toThrow('http 502');
  });
  it('fake link provider is deterministic per request id', async () => {
    const a = await fakeLinkProvider.createPaymentLink(input);
    expect(await fakeLinkProvider.createPaymentLink(input)).toEqual(a);
  });
});
