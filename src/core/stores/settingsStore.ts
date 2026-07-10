import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Lang = 'en' | 'he';

type SettingsState = {
  language: Lang;
  _hydrated: boolean;
  setLanguage: (language: Lang) => void;
  setHydrated: (value?: boolean) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: 'en',
      _hydrated: false,
      setLanguage: (language) => set({ language }),
      setHydrated: (value = true) => set({ _hydrated: value }),
    }),
    {
      name: 'bama-settings',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : ({
          getItem: () => null,
          setItem: () => undefined,
          removeItem: () => undefined,
        } as Storage)
      ),
      partialize: (state) => ({ language: state.language }),
      onRehydrateStorage: () => {
        return (state, error) => {
          console.log('[settingsStore] rehydrated:', state, error);
          if (state) {
            state.setHydrated(true);
          } else {
            useSettingsStore.setState({ _hydrated: true });
          }
        };
      },
    }
  )
);
