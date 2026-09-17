import { isPendingReview, decideActivation } from '../review';

const seat = (category: string, quantity = 1) => ({ category, quantity });
const fill = (category: string) => ({ category, professionalId: `pro-${category}` });
const offer = (status: string, review?: string) => ({ status, ...(review ? { review } : {}) });

describe('isPendingReview (server)', () => {
  it('accepted + pending is pending', () => {
    expect(isPendingReview(offer('accepted', 'pending'))).toBe(true);
  });
  it('confirmed or absent review is not pending', () => {
    expect(isPendingReview(offer('accepted', 'confirmed'))).toBe(false);
    expect(isPendingReview(offer('accepted'))).toBe(false);
  });
  it("a removed offer's stale review: 'pending' is not pending", () => {
    expect(isPendingReview(offer('removed', 'pending'))).toBe(false);
  });
});

describe('decideActivation', () => {
  const full = { status: 'open', crewSlots: [seat('Editor')], filledSlots: [fill('Editor')] };

  it('activates when the crew is confirmed and no seat is empty', () => {
    expect(decideActivation(full, [offer('accepted', 'confirmed')]).activate).toBe(true);
  });

  it('treats a legacy accepted offer (no review field) as confirmed', () => {
    expect(decideActivation(full, [offer('accepted')]).activate).toBe(true);
  });

  it('waits while anyone is under review', () => {
    const d = decideActivation(full, [offer('accepted', 'confirmed'), offer('accepted', 'pending')]);
    expect(d.activate).toBe(false);
    expect(d.reason).toMatch(/under review/);
  });

  it('waits while a seat is empty (C3) — the noticeboard only lists open projects', () => {
    const project = { status: 'open', crewSlots: [seat('Editor'), seat('Sound Recordist')], filledSlots: [fill('Editor')] };
    const d = decideActivation(project, [offer('accepted', 'confirmed')]);
    expect(d.activate).toBe(false);
    expect(d.reason).toMatch(/vacant/);
  });

  it('counts seats by quantity', () => {
    const twoCams = { status: 'open', crewSlots: [seat('Editor', 2)], filledSlots: [fill('Editor')] };
    expect(decideActivation(twoCams, [offer('accepted', 'confirmed')]).activate).toBe(false);
  });

  it('never activates a project that is not open', () => {
    for (const status of ['in_progress', 'completed', 'cancelled']) {
      expect(decideActivation({ ...full, status }, [offer('accepted', 'confirmed')]).activate).toBe(false);
    }
  });

  it('needs a crew', () => {
    const empty = { status: 'open', crewSlots: [], filledSlots: [] };
    expect(decideActivation(empty, []).activate).toBe(false);
    expect(decideActivation(empty, [offer('rejected'), offer('pending')]).activate).toBe(false);
  });

  it("a rejected candidate's removed offer, still flagged review: 'pending', does NOT block activation", () => {
    // The exact state rejectCandidate leaves behind: releaseEngagement sets the
    // offer to 'removed' and does not touch `review`. Seats are full again (the
    // role was refilled) and the remaining crew is confirmed.
    const offers = [offer('accepted', 'confirmed'), offer('removed', 'pending')];
    const d = decideActivation(full, offers);
    expect(d.activate).toBe(true);
  });
});
