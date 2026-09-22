import React from 'react';
import { render } from '@testing-library/react-native';
import ProfessionalProfileScreen from '../index';

/**
 * THE PRO'S OWN PROFILE OPENS ON SKILLS.
 *
 * It used to open on Equipment. A first-time pro is routed straight to this
 * screen and held there until they add a role — and a role is added under
 * Skills, so Equipment was the one tab that could not let them out. It is the
 * tab that matters on a return visit too, so the choice is unconditional.
 *
 * ContentTabs is stubbed: what is under test is which tab this screen ASKS
 * for, not how ContentTabs honours it (ContentTabs.test.tsx covers that).
 */

const tabProps: Record<string, unknown>[] = [];

jest.mock('@features/profile/components/ContentTabs', () => ({
  ContentTabs: (props: Record<string, unknown>) => { tabProps.push(props); return null; },
}));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}) }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ initialWindowMetrics: { insets: { top: 0, bottom: 0 } } }));
jest.mock('@components/ui/GradientBand', () => ({ GradientBand: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@features/profile/components/ProfileHeader', () => ({ ProfileHeader: () => null }));
jest.mock('@features/profile/components/BioSection', () => ({ BioSection: () => null }));
jest.mock('@features/profile/components/PortfolioGrid', () => ({ PortfolioGrid: () => null }));
jest.mock('@features/profile/hooks/usePortfolio', () => ({
  usePortfolio: () => ({ assets: [], upload: jest.fn(), addVideoUrl: jest.fn(), remove: jest.fn(), isUploading: false }),
}));
jest.mock('@features/auth/hooks/useSwitchMode', () => ({ useSwitchMode: () => ({ switchMode: jest.fn() }) }));
jest.mock('@core/navigation/floatingTabBar', () => ({ useTabBarClearance: () => 0 }));

const profile = { roleSkills: [{ role: 'videographer', specializations: [] }], bio: '', equipment: [], priceList: [], proProfileCompleted: true };
jest.mock('@features/profile/hooks/useProfile', () => ({
  useProfile: () => ({
    user: { displayName: 'Dana', photoURL: null },
    profile, reviews: [], isLoading: false, isSaving: false,
    save: jest.fn(), updateAvailability: jest.fn(),
  }),
}));
// The screen calls useUiStore both ways: bare (destructuring showToast) and
// with a selector. The mock has to answer both.
jest.mock('@core/stores/uiStore', () => {
  const state = { showToast: jest.fn(), setProfileEditing: jest.fn() };
  return { useUiStore: (sel?: (x: typeof state) => unknown) => (sel ? sel(state) : state) };
});
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { proProfileCompleted: boolean }) => unknown) => s({ proProfileCompleted: true }),
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

beforeEach(() => { tabProps.length = 0; });

it('asks ContentTabs to open on skills', () => {
  render(<ProfessionalProfileScreen />);

  expect(tabProps.length).toBeGreaterThan(0);
  expect(tabProps[0].initialSection).toBe('skills');
});

it('asks for skills even on a profile that is already complete', () => {
  // The old rule opened on Skills only while the profile was incomplete; this
  // one is complete, and Skills is still what it asks for.
  render(<ProfessionalProfileScreen />);

  expect(profile.proProfileCompleted).toBe(true);
  expect(tabProps[0].initialSection).toBe('skills');
});
