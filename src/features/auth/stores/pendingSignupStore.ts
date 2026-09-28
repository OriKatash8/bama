import { create } from 'zustand';

/**
 * A social sign-in that created a NEW account and is waiting on the consent
 * screen. Holds what the provider told us once (Apple sends the name only on
 * the very first authorization), so it can be written after consent — and
 * dropped, with the account, if they decline.
 */
export type PendingSignup = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
};

type State = {
  pending: PendingSignup | null;
  setPending: (p: PendingSignup | null) => void;
};

export const usePendingSignupStore = create<State>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
}));
