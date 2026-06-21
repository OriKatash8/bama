import { createContext, useContext, type ReactNode } from 'react';
import { useUiStore } from '@core/stores/uiStore';

export type AppColors = {
  bg: string;
  card: string;
  cardAlt: string;
  text: string;
  textSec: string;
  textMuted: string;
  border: string;
  borderMuted: string;
  inputBg: string;
  inputBorder: string;
  placeholder: string;
  tabBar: string;
  primary: string;
  accent: string;
};

export const DARK: AppColors = {
  bg: '#0f0f1f',
  card: '#1a1a2e',
  cardAlt: '#2a2a3e',
  text: '#ffffff',
  textSec: 'rgba(255,255,255,0.6)',
  textMuted: 'rgba(255,255,255,0.4)',
  border: '#ffffff18',
  borderMuted: '#ffffff10',
  inputBg: 'rgba(255,255,255,0.08)',
  inputBorder: '#ffffff22',
  placeholder: 'rgba(255,255,255,0.4)',
  tabBar: '#0f0f1f',
  primary: '#004aad',
  accent: '#cb6ce6',
};

export const LIGHT: AppColors = {
  bg: '#eff5ff',
  card: '#dce8ff',
  cardAlt: '#d0dfff',
  text: '#0f0f1f',
  textSec: 'rgba(15,15,31,0.6)',
  textMuted: 'rgba(15,15,31,0.4)',
  border: '#004aad20',
  borderMuted: '#004aad10',
  inputBg: 'rgba(0,74,173,0.06)',
  inputBorder: '#004aad22',
  placeholder: 'rgba(15,15,31,0.35)',
  tabBar: '#eff5ff',
  primary: '#004aad',
  accent: '#cb6ce6',
};

export const ThemeContext = createContext<AppColors>(DARK);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const isDark = useUiStore((s) => s.isDark);
  const colors = isDark ? DARK : LIGHT;
  return (
    <ThemeContext.Provider value={colors}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): AppColors {
  return useContext(ThemeContext);
}
