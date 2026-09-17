import { releaseNotice } from '../removal';

describe('releaseNotice', () => {
  it('a professional who declined during review "chose not to continue"', () => {
    expect(releaseNotice('candidate_declined', 'Avi')).toBe('Avi החליט/ה לא להמשיך בפרויקט');
  });
  it.each(['candidate_rejected', 'pro_withdrew', 'client_removed'] as const)(
    '%s keeps the neutral "left the project" line',
    (reason) => {
      expect(releaseNotice(reason, 'Avi')).toBe('Avi עזב את הפרויקט');
    },
  );
});
