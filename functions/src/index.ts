export * from './auth';
export * from './bookings';
export * from './notifications';
// NOT exported: callClaude (./claude). Withheld on purpose, see scripts/deploy-drift-allowlist.json.
// Firebase deploys exactly what this file exports, so leaving it out is what stops a full
// `firebase deploy --only functions` from redeploying it. functions/src/__tests__/withheldFunctions.test.ts
// fails if a withheld function is exported from here again.
export * from './video';
export * from './moderation';
export * from './moderation/lookup';
export * from './moderation/userActivity';
export * from './moderation/blocking';
export * from './moderation/reportAlert';
export * from './system';
export * from './usage';
export * from './account/deletion';
export * from './account/discardSignup';

// Pricing & project lifecycle (slice 1)
export * from './lifecycle/hire';
export * from './lifecycle/candidates';
export * from './lifecycle/deletion';
export * from './lifecycle/repricing';
export * from './lifecycle/completion';
export * from './lifecycle/removal';
export * from './lifecycle/subscription';
export * from './lifecycle/reviews';
export * from './lifecycle/cron';
export * from './lifecycle/adminViews';
export * from './lifecycle/endDate';
export * from './lifecycle/contact';
export * from './lifecycle/closingTrigger';
export * from './lifecycle/feeOverdue';
export * from './lifecycle/disputeResolution';

// Community invites (europe-west1). resolveCommunityInvite is deliberately NOT re-exported
// here (withheld until the web landing task; see scripts/deploy-drift-allowlist.json), so a
// full deploy cannot ship it. Named exports, not `export *`, for exactly that reason.
export {
  createCommunityInvite, getCommunityInvite, revokeCommunityInvite,
  onCommunityInviteJoinRequest, onCommunityDeleted,
} from './communities/invites';
export * from './communities/adminDelete';
export * from './communities/adminActions';
export * from './communities/ownerTransfer';

// Rental companies: store-synced rental items (europe-west1).
export * from './rentals';

// Fee charging from a saved card token (europe-west1). Inert while paymentProvider is 'none'.
export * from './payments';
