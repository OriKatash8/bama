import { create } from 'zustand';
import { EMPTY_DEMO_CONFIG, isCommunityOnSide, isSameSide, type DemoConfig } from '@core/demo/demoSides';

/**
 * The demo-account config (config/demoAccounts), live, for as long as someone is
 * signed in. Subscribed once in useAuth, like the block list, and read at call
 * time by every list that shows other people — see src/core/demo/demoSides.ts.
 */
type DemoState = {
  config: DemoConfig;
  setConfig: (config: DemoConfig) => void;
  clear: () => void;
};

export const useDemoStore = create<DemoState>((set) => ({
  config: EMPTY_DEMO_CONFIG,
  setConfig: (config) => set({ config }),
  clear: () => set({ config: EMPTY_DEMO_CONFIG }),
}));

/** Whether `other` belongs in `me`'s lists, by the current config. */
export function onMySide(me: string | null | undefined, other: string | null | undefined): boolean {
  return isSameSide(useDemoStore.getState().config, me, other);
}

/** Whether a community belongs in `me`'s discovery list, by the current config. */
export function communityOnMySide(me: string | null | undefined, communityId: string, ownerId?: string | null): boolean {
  return isCommunityOnSide(useDemoStore.getState().config, me, communityId, ownerId);
}
