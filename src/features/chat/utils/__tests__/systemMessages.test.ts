import { isCrewReady } from '../systemMessages';

/**
 * Both the chat room's pill and the chat list's preview key off this, so it is
 * the one place the server's Hebrew wording is recognised.
 */
describe('isCrewReady', () => {
  it('matches the message the server actually writes, with and without names', () => {
    // functions/src/lifecycle/candidates.ts:258 writes exactly these two forms.
    expect(isCrewReady('🎬 הצוות נסגר')).toBe(true);
    expect(isCrewReady('🎬 הצוות נסגר: דנה כהן, אורי')).toBe(true);
  });

  it('matches on the phrase alone, if the marker is ever dropped', () => {
    expect(isCrewReady('הצוות נסגר')).toBe(true);
  });

  it('does not match another system message', () => {
    expect(isCrewReady('📅 פגישה חדשה')).toBe(false);
    expect(isCrewReady('🏁 הפרויקט הושלם')).toBe(false);
    expect(isCrewReady('💰 בקשת שינוי מחיר')).toBe(false);
  });

  it('does not match an ordinary message', () => {
    expect(isCrewReady('שלום, מה קורה?')).toBe(false);
    expect(isCrewReady('hello')).toBe(false);
  });

  it('does not match someone simply TALKING about the crew', () => {
    // The whole phrase matters, not the word. "הצוות" on its own is ordinary
    // Hebrew, and matching it would rewrite a member's real message into a
    // status line — losing what they actually said.
    expect(isCrewReady('הצוות שלנו מעולה')).toBe(false);
    expect(isCrewReady('מתי הצוות מגיע?')).toBe(false);
    expect(isCrewReady('צריך עוד מישהו בצוות')).toBe(false);
  });

  it('is safe on an empty or missing preview', () => {
    expect(isCrewReady('')).toBe(false);
    expect(isCrewReady(null)).toBe(false);
    expect(isCrewReady(undefined)).toBe(false);
  });
});
