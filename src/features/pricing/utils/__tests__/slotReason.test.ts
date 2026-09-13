import { slotReason } from '../balance';
import type { ProjectFee } from '@core/types/project';

const eng = (engagementStatus?: string) => ({ engagementStatus } as ProjectFee);

/**
 * A slot the professional cannot free must not be presented as one he is failing
 * to free. The cap view read only `project.status`, and a contest REOPENS the
 * project (derive.ts:187) — so the slot showed as "Active", under copy saying a
 * slot frees when a project is completed or cancelled. He can do neither.
 */
describe('slotReason', () => {
  it('names a contested engagement as under review', () => {
    expect(slotReason({ status: 'open' }, eng('disputed'))).toBe('under_review');
  });

  it('still says under review even though the project reopened to `open`', () => {
    // The exact shape the bug produced: project reopened by the dispute, so
    // status alone says "active" and the professional is told to go close it.
    expect(slotReason({ status: 'open' }, eng('disputed'))).not.toBe('active');
  });

  it('reads the engagement, not the project — a completed project with a live contest', () => {
    expect(slotReason({ status: 'completed' }, eng('disputed'))).toBe('under_review');
  });

  it('falls back to the project for everything else', () => {
    expect(slotReason({ status: 'completed' }, eng('completed'))).toBe('completed');
    expect(slotReason({ status: 'open' }, eng('hired'))).toBe('active');
  });

  it('says active when the viewer has no engagement record at all', () => {
    // Exempt, or a fee document that predates the field. Nothing claims review.
    expect(slotReason({ status: 'open' }, null)).toBe('active');
    expect(slotReason({ status: 'open' }, undefined)).toBe('active');
    expect(slotReason({ status: 'open' }, eng(undefined))).toBe('active');
  });

  it('never infers review from ANOTHER professional’s dispute', () => {
    // The project-level `adminReviewPending` roll-up is true when anyone's
    // engagement is in review. Keying on it would tell a professional his slot is
    // under review because someone else contested — wrong, and none of his
    // business. slotReason cannot see that flag, and this pins that it does not
    // grow the ability to.
    const projectWithSomeoneElsesDispute = { status: 'open', adminReviewPending: true } as never;
    expect(slotReason(projectWithSomeoneElsesDispute, eng('hired'))).toBe('active');
  });
});
