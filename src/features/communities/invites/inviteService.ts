import { callFunction } from '@core/firebase/functions';

/** createCommunityInvite's reply: reused per community and creator, so repeat taps return the same link. */
export interface CreatedInvite {
  token: string;
  shortCode: string;
  url: string;
}

export type InviteMembership = 'member' | 'pending' | 'none';

/** getCommunityInvite's reply (inviteCore.authedInviteBody / PUBLIC_MISS). */
export type InviteLookup =
  | { exists: false }
  | { exists: true; revoked: true }
  | {
      exists: true;
      revoked: false;
      token: string;
      communityId: string;
      communityName: string;
      description?: string | null;
      avatarUrl?: string | null;
      membership: InviteMembership;
    };

const REGION = 'europe-west1' as const;

export const createCommunityInvite = (communityId: string) =>
  callFunction<{ communityId: string }, CreatedInvite>('createCommunityInvite', REGION)({ communityId });

export const getCommunityInvite = (tokenOrCode: string) =>
  callFunction<{ tokenOrCode: string }, InviteLookup>('getCommunityInvite', REGION)({ tokenOrCode });

export const revokeCommunityInvite = (token: string) =>
  callFunction<{ token: string }, unknown>('revokeCommunityInvite', REGION)({ token });
