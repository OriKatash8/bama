import { create } from 'zustand';

/** A notice to surface to the affected user. Lives in its own store so it
 *  survives authStore.clear() (a suspension signs the user out). */
export type ModerationNotice = {
  status: 'warned' | 'suspended';
  reason: string;
};

type ModerationState = {
  notice: ModerationNotice | null;
  setNotice: (notice: ModerationNotice | null) => void;
  clearNotice: () => void;
};

export const useModerationStore = create<ModerationState>((set) => ({
  notice: null,
  setNotice: (notice) => set({ notice }),
  clearNotice: () => set({ notice: null }),
}));
