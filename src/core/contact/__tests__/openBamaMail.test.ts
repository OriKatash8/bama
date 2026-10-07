import { Linking } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { bamaMailtoUrl, openBamaMail } from '../openBamaMail';
import { useBamaMail } from '../useBamaMail';
import { useUiStore } from '@core/stores/uiStore';

const RENTAL = 'בקשה להצטרף כמשכיר ציוד - BAMA';
const COURSES = 'בקשה להצטרף כמדריך - BAMA';
const MSG = 'לא הצלחנו לפתוח את אפליקציית הדואר. אפשר לכתוב לנו ל-{{email}}';

let openURL: jest.SpyInstance;
beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL');
  useUiStore.setState({ toasts: [] });
});
afterEach(() => openURL.mockRestore());

describe('bamaMailtoUrl', () => {
  it('goes to BAMA with the exact subject, percent-encoded, and no body', () => {
    expect(bamaMailtoUrl(RENTAL)).toBe(`mailto:bama.app.hk@gmail.com?subject=${encodeURIComponent(RENTAL)}`);
    expect(decodeURIComponent(bamaMailtoUrl(COURSES).split('subject=')[1])).toBe(COURSES);
    expect(bamaMailtoUrl(COURSES)).not.toMatch(/body=/);
  });
});

describe('openBamaMail', () => {
  it('true when the link is taken', async () => {
    openURL.mockResolvedValue(true);
    await expect(openBamaMail(RENTAL)).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledWith(bamaMailtoUrl(RENTAL));
  });
  it('false, never a throw, when openURL rejects (no mail account)', async () => {
    openURL.mockRejectedValue(new Error('Unable to open URL'));
    await expect(openBamaMail(RENTAL)).resolves.toBe(false);
  });
  it('false, never a throw, when openURL throws synchronously', async () => {
    openURL.mockImplementation(() => { throw new Error('boom'); });
    await expect(openBamaMail(RENTAL)).resolves.toBe(false);
  });
});

describe('useBamaMail', () => {
  it('on success: no toast, not failed', async () => {
    openURL.mockResolvedValue(true);
    const { result } = renderHook(() => useBamaMail(COURSES, MSG));
    await act(async () => { await result.current.open(); });
    expect(result.current.failed).toBe(false);
    expect(useUiStore.getState().toasts).toHaveLength(0);
  });
  it.each([
    ['rejects', () => openURL.mockRejectedValue(new Error('no mail'))],
    ['throws', () => openURL.mockImplementation(() => { throw new Error('boom'); })],
  ])('when openURL %s: an error toast carrying the address ALWAYS fires, and the address is kept on screen', async (_n, arrange) => {
    arrange();
    const { result } = renderHook(() => useBamaMail(COURSES, MSG));
    await act(async () => { await result.current.open(); });
    const toasts = useUiStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('error');
    expect(toasts[0].message).toContain('bama.app.hk@gmail.com');
    expect(toasts[0].message).not.toContain('{{email}}');
    expect(result.current.failed).toBe(true);
    expect(result.current.email).toBe('bama.app.hk@gmail.com');
  });
});
