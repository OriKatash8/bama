import { Platform, Share } from 'react-native';
import { shareInviteLink } from '../shareInviteLink';

const P = { title: 'Invite to Gaffers', message: 'Join the Gaffers community on BAMA: https://x/c/T', url: 'https://x/c/T' };
const realOS = Platform.OS;
const g = globalThis as { navigator?: unknown };
const realNavigator = g.navigator;

afterEach(() => {
  (Platform as { OS: string }).OS = realOS;
  Object.defineProperty(globalThis, 'navigator', { value: realNavigator, configurable: true, writable: true });
  jest.restoreAllMocks();
});
const setNavigator = (nav: unknown) => Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });

describe('native: the share sheet', () => {
  beforeEach(() => { (Platform as { OS: string }).OS = 'ios'; });

  it('shares the message (which already holds the link) with the title, and does not also pass url', async () => {
    const spy = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction } as never);
    await expect(shareInviteLink(P)).resolves.toBe('shared');
    expect(spy).toHaveBeenCalledWith({ message: P.message, title: P.title });
    expect((spy.mock.calls[0][0] as Record<string, unknown>).url).toBeUndefined();
  });

  it('closing the sheet is "cancelled", not an error', async () => {
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction } as never);
    await expect(shareInviteLink(P)).resolves.toBe('cancelled');
  });

  it('a failing sheet throws for the caller to report', async () => {
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('boom'));
    await expect(shareInviteLink(P)).rejects.toThrow('boom');
  });
});

describe('web', () => {
  beforeEach(() => { (Platform as { OS: string }).OS = 'web'; });

  it('uses the Web Share API when the browser has it', async () => {
    const share = jest.fn(async () => undefined);
    const writeText = jest.fn(async () => undefined);
    setNavigator({ share, clipboard: { writeText } });
    await expect(shareInviteLink(P)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: P.title, text: P.message });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('dismissing the browser sheet (AbortError) is "cancelled" and does NOT copy behind the user\'s back', async () => {
    const writeText = jest.fn(async () => undefined);
    setNavigator({ share: jest.fn(async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); }), clipboard: { writeText } });
    await expect(shareInviteLink(P)).resolves.toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('a share that fails for another reason falls back to copying the bare link', async () => {
    const writeText = jest.fn(async () => undefined);
    setNavigator({ share: jest.fn(async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); }), clipboard: { writeText } });
    await expect(shareInviteLink(P)).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(P.url);
  });

  it('no Web Share: copies the link', async () => {
    const writeText = jest.fn(async () => undefined);
    setNavigator({ clipboard: { writeText } });
    await expect(shareInviteLink(P)).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(P.url);
  });

  it('a refused clipboard, or neither API: "unsupported"', async () => {
    setNavigator({ clipboard: { writeText: jest.fn(async () => { throw new Error('denied'); }) } });
    await expect(shareInviteLink(P)).resolves.toBe('unsupported');
    setNavigator({});
    await expect(shareInviteLink(P)).resolves.toBe('unsupported');
    setNavigator(undefined);
    await expect(shareInviteLink(P)).resolves.toBe('unsupported');
  });
});
