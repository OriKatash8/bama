import { createContext, useContext, type ReactNode } from 'react';
import { useUiStore } from '@core/stores/uiStore';

export type AppColors = {
  bg: string;
  bgGradient: readonly [string, string];
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
  bgGradient: ['#0f0f1f', '#0f0f1f'],
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
  bg: '#E6E0F4',
  bgGradient: ['#E6E0F4', '#D0DFF7'],
  /**
   * NOT the product card colour, despite the name. This is a pale blue.
   *
   * ~50 sites use it, and they are all one stratum: admin screens, modal sheets,
   * input bars and a few shared components. NO product content card does —
   * PriceOfferCard, BundleOfferCard, ProjectRequestCard, the dashboard project
   * card and project-details' memberCard all hardcode `#ffffff` with a
   * `rgba(30,79,163,0.07)` border and a `#1e4fa3` CARD_SHADOW.
   *
   * Following this token on a new content surface produces a card that does not
   * match any other card in the app. That already happened once, to the pricing
   * screens. Reach for the hardcoded convention instead; see `memberCard` in
   * src/app/(client)/(tabs)/chats/project-details.tsx for the reference.
   */
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
  tabBar: '#ffffff',
  primary: '#004aad',
  accent: '#cb6ce6',
};

export const ThemeContext = createContext<AppColors>(DARK);

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeContext.Provider value={LIGHT}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): AppColors {
  return useContext(ThemeContext);
}
