import { contestErrorKey } from '../contestErrors';

describe('contestErrorKey', () => {
  it.each([
    ['contest-window-closed', 'engagement.contest_error_window_closed'],
    ['no-charge-window', 'engagement.contest_error_window_closed'],
    ['already-disputed', 'engagement.contest_error_already_disputed'],
    ['dispute-resolved', 'engagement.contest_error_already_resolved'],
    ['fee-already-paid', 'engagement.contest_error_already_paid'],
    ['no-engagement', 'engagement.contest_error_not_allowed'],
    ['something unexpected', 'engagement.contest_error'],
  ])('maps %s', (message, key) => {
    expect(contestErrorKey({ message })).toBe(key);
  });

  it('maps a permission-denied code and survives a non-error', () => {
    expect(contestErrorKey({ code: 'functions/permission-denied', message: 'x' })).toBe('engagement.contest_error_not_allowed');
    expect(contestErrorKey(undefined)).toBe('engagement.contest_error');
  });
});
