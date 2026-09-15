/**
 * The noticeboard's History button only shows when there is something in it: a
 * sent offer, or a hidden notice that can still be restored (its project exists
 * and is open, see useHiddenProjects).
 */
export function hasNoticeHistory(sentOfferCount: number, restorableHiddenCount: number): boolean {
  return sentOfferCount > 0 || restorableHiddenCount > 0;
}
