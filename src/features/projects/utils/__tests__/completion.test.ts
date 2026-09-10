import { canDispute } from '../completion';
import type { ProjectRequest } from '@core/types/project';

const ts = (ms: number) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 });
type DisputeInput = Pick<ProjectRequest, 'completion' | 'disputeWindowEndsAt'>;
const project = (over: Partial<DisputeInput> = {}): DisputeInput => ({
  completion: { state: 'confirmed' },
  disputeWindowEndsAt: ts(2_000_000_000) as never,
  ...over,
});

/**
 * Mirrors the server guard in `disputeFeeByPro`. If these disagree the button
 * either appears when the callable will refuse, or hides while it would accept.
 */
describe('canDispute', () => {
  it('allows a dispute inside the window', () => {
    expect(canDispute(project(), 1_999_999_000)).toBe(true);
  });

  it('allows it exactly on the deadline', () => {
    expect(canDispute(project(), 2_000_000_000)).toBe(true);
  });

  it('refuses one millisecond after the deadline', () => {
    expect(canDispute(project(), 2_000_000_001)).toBe(false);
  });

  it.each(['none', 'requested', 'disputed'] as const)(
    'refuses while completion.state is %s — there is nothing confirmed to dispute',
    (state) => {
      expect(canDispute(project({ completion: { state } }), 1_000)).toBe(false);
    },
  );

  it('refuses when completion is absent entirely', () => {
    expect(canDispute(project({ completion: undefined }), 1_000)).toBe(false);
  });

  it('defers to the server when no deadline was stamped', () => {
    // Confirmed before disputeWindowEndsAt existed. The client cannot know the
    // window, so it hides the button rather than guessing; the callable still
    // computes the fallback and would accept.
    expect(canDispute(project({ disputeWindowEndsAt: undefined }), 1_000)).toBe(false);
  });
});
