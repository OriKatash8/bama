import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export type Toast = {
  id: string;
  message: string;
  type: ToastType;
};

type UiState = {
  isLoading: boolean;
  toasts: Toast[];
  isNewProfessional: boolean;
  isDark: boolean;
  setLoading: (loading: boolean) => void;
  showToast: (message: string, type?: ToastType) => void;
  dismissToast: (id: string) => void;
  setNewProfessional: (val: boolean) => void;
  toggleTheme: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  isLoading: false,
  toasts: [],
  isNewProfessional: false,
  isDark: true,
  setLoading: (isLoading) => set({ isLoading }),
  showToast: (message, type = 'info') =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, message, type },
      ],
    })),
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  setNewProfessional: (isNewProfessional) => set({ isNewProfessional }),
  toggleTheme: () => set((state) => ({ isDark: !state.isDark })),
}));
