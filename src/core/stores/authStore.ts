import { create } from 'zustand';
import type { User, ActiveMode } from '@core/types/user';

type AuthState = {
  user: User | null;
  activeMode: ActiveMode | null;
  isLoading: boolean;
  /** Whether the professional profile is completed. null = unknown/loading,
   *  false = first-time/not completed (locks the pro app), true = completed. */
  proProfileCompleted: boolean | null;
  setUser: (user: User | null) => void;
  setActiveMode: (mode: ActiveMode | null) => void;
  setProProfileCompleted: (v: boolean | null) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  activeMode: null,
  isLoading: true,
  proProfileCompleted: null,
  setUser: (user) => set({ user }),
  setActiveMode: (activeMode) => set({ activeMode }),
  setProProfileCompleted: (proProfileCompleted) => set({ proProfileCompleted }),
  setLoading: (isLoading) => set({ isLoading }),
  clear: () => set({ user: null, activeMode: null, proProfileCompleted: null, isLoading: false }),
}));
