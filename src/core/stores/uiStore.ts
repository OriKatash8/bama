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
  projectSubmittedNonce: number;
  /** Step the project builder should jump to; the nonce fires the wizard's effect
   *  even when the same step is requested twice. Set by the review screen's
   *  per-section "edit" links, which then pop back to the still-mounted wizard. */
  builderStep: 1 | 2 | 3;
  builderStepNonce: number;
  /** True while the professional profile is in edit mode — hides the tab bar. */
  profileEditing: boolean;
  setLoading: (loading: boolean) => void;
  showToast: (message: string, type?: ToastType) => void;
  dismissToast: (id: string) => void;
  setNewProfessional: (val: boolean) => void;
  toggleTheme: () => void;
  notifyProjectSubmitted: () => void;
  requestBuilderStep: (step: 1 | 2 | 3) => void;
  setProfileEditing: (val: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  isLoading: false,
  toasts: [],
  isNewProfessional: false,
  isDark: false,
  projectSubmittedNonce: 0,
  builderStep: 1,
  builderStepNonce: 0,
  profileEditing: false,
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
  notifyProjectSubmitted: () =>
    set((state) => ({ projectSubmittedNonce: state.projectSubmittedNonce + 1 })),
  requestBuilderStep: (builderStep) =>
    set((state) => ({ builderStep, builderStepNonce: state.builderStepNonce + 1 })),
  setProfileEditing: (profileEditing) => set({ profileEditing }),
}));
