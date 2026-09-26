import { create } from 'zustand';
import type { User, ActiveMode } from '@core/types/user';

type AuthState = {
  user: User | null;
  activeMode: ActiveMode | null;
  isLoading: boolean;
  /** Whether the professional profile is completed. null = unknown/loading,
   *  false = first-time/not completed (locks the pro app), true = completed. */
  proProfileCompleted: boolean | null;
  /** Whether the user finished the first-time client onboarding. null = unknown/
   *  loading, false = first-time (routes to onboarding), true = done. */
  clientOnboarded: boolean | null;
  /** Whether the user has a phone number on file (users/{uid}/private/contact).
   *  null = unknown/loading, false = none (routes to /settings/phone), true = has one. */
  hasPhone: boolean | null;
  setUser: (user: User | null) => void;
  setActiveMode: (mode: ActiveMode | null) => void;
  setProProfileCompleted: (v: boolean | null) => void;
  setClientOnboarded: (v: boolean | null) => void;
  setHasPhone: (v: boolean | null) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  activeMode: null,
  isLoading: true,
  proProfileCompleted: null,
  clientOnboarded: null,
  hasPhone: null,
  setUser: (user) => set({ user }),
  setActiveMode: (activeMode) => set({ activeMode }),
  setProProfileCompleted: (proProfileCompleted) => set({ proProfileCompleted }),
  setClientOnboarded: (clientOnboarded) => set({ clientOnboarded }),
  setHasPhone: (hasPhone) => set({ hasPhone }),
  setLoading: (isLoading) => set({ isLoading }),
  clear: () => set({ user: null, activeMode: null, proProfileCompleted: null, clientOnboarded: null, hasPhone: null, isLoading: false }),
}));
