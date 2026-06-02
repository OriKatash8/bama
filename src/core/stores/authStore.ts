import { create } from 'zustand';
import type { User } from '@core/types/user';
import type { ActiveMode } from '@core/types/user';

type AuthState = {
  user: User | null;
  activeMode: ActiveMode | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setActiveMode: (mode: ActiveMode | null) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  activeMode: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setActiveMode: (activeMode) => set({ activeMode }),
  setLoading: (isLoading) => set({ isLoading }),
  clear: () => set({ user: null, activeMode: null, isLoading: false }),
}));
