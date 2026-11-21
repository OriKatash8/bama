/**
 * Which `engagement.*` string a failed `contestEngagement` shows.
 *
 * The callable refuses for distinct reasons, and a bare generic toast made
 * "the window closed" read as "try again". The server's code is mapped to a
 * message and never shown raw. Anything unrecognised keeps the generic text.
 */
export function contestErrorKey(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? '');
  if (msg.includes('contest-window-closed') || msg.includes('no-charge-window')) {
    return 'engagement.contest_error_window_closed';
  }
  if (msg.includes('dispute-resolved')) return 'engagement.contest_error_already_resolved';
  if (msg.includes('already-disputed')) return 'engagement.contest_error_already_disputed';
  if (msg.includes('fee-already-paid')) return 'engagement.contest_error_already_paid';
  const code = String((err as { code?: string })?.code ?? '');
  if (
    code.includes('permission-denied') || code.includes('not-found') || code.includes('unauthenticated')
    || msg.includes('no-engagement') || msg.includes('permission-denied')
  ) {
    return 'engagement.contest_error_not_allowed';
  }
  return 'engagement.contest_error';
}
