import React from 'react';
import { StyleSheet } from 'react-native';
import { render, act } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import PublicProfileScreen from '../[userId]';
import { ChevronLeft, ChevronRight, Flag } from 'lucide-react-native';
import { getDocument } from '@core/firebase/firestore';

/**
 * THE BAND'S TWO BUTTONS: REPORT LEADS, BACK TRAILS.
 *
 * They used to sit the other way round, with the back chevron pointing the way
 * you travel. Now that back sits at the trailing edge the chevron points
 * OUTWARD instead — toward its own edge, away from the band's content — so in
 * English it points right and in Hebrew it points left. Language is what turns
 * it, and nothing else.
 */

const SOFT_VIOLET = '#F3EEFE';
const DEEP_VIOLET = '#6D28D9';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ userId: 'pro-1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useSegments: () => ['(client)'],
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('@core/firebase/config', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  addDoc: jest.fn(), collection: jest.fn(), doc: jest.fn(),
  serverTimestamp: jest.fn(), updateDoc: jest.fn(),
}));
jest.mock('@core/firebase/storage', () => ({ uploadFile: jest.fn() }));
jest.mock('@core/firebase/firestore', () => ({
  getDocument: jest.fn(),
  queryDocuments: jest.fn(() => Promise.resolve([])),
}));
jest.mock('@features/reviews/services/reviewsService', () => ({
  fetchPublishedReviews: jest.fn(() => Promise.resolve([])),
}));
jest.mock('@features/profile/components/ProfileHeader', () => ({ ProfileHeader: () => null }));
jest.mock('@features/profile/components/BioSection', () => ({ BioSection: () => null }));
jest.mock('@features/profile/components/ContentTabs', () => ({ ContentTabs: () => null }));
jest.mock('@features/profile/components/PortfolioGrid', () => ({ PortfolioGrid: () => null }));
jest.mock('@features/projects/components/DirectProjectSheet', () => ({ DirectProjectSheet: () => null }));
let mockLanguage = 'en';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLanguage }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'client-1' } }),
}));

const mockGetDocument = getDocument as jest.Mock;

/** Every testID in render order; consecutive repeats (composite + host layers
 *  carrying one id) collapse, because the ORDER is what this is for. */
function testIDsInOrder(root: ReactTestInstance): string[] {
  const out: string[] = [];
  const visit = (node: ReactTestInstance) => {
    const id = node.props?.testID;
    if (typeof id === 'string' && id !== out[out.length - 1]) out.push(id);
    node.children.forEach((c) => typeof c !== 'string' && visit(c));
  };
  visit(root);
  return out;
}

async function openProfile() {
  mockGetDocument.mockImplementation(async (path: string) =>
    path.includes('/profile/') ? { bio: '', equipment: [], roleSkills: [] } : { id: 'pro-1', displayName: 'Dana', photoURL: null });
  const r = render(<PublicProfileScreen />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

beforeEach(() => { jest.clearAllMocks(); mockLanguage = 'en'; });

it('puts report before back in the band', async () => {
  const r = await openProfile();

  const ids = testIDsInOrder(r.root).filter((id) => id === 'profile-back' || id === 'profile-report');
  expect(ids).toEqual(['profile-report', 'profile-back']);
});

it('sets the report flag on a soft violet tile', async () => {
  const r = await openProfile();

  const style = StyleSheet.flatten(r.getByTestId('profile-report').props.style as never) as {
    backgroundColor?: string; width?: number; height?: number;
  };
  expect(style.backgroundColor).toBe(SOFT_VIOLET);
  // Square, not a pill or a bare icon.
  expect(style.width).toBe(style.height);
});

it('draws the flag itself in the deep violet of the same pair', async () => {
  const r = await openProfile();

  const [flag] = r.getByTestId('profile-report').findAllByType(Flag);
  expect(flag.props.color).toBe(DEEP_VIOLET);
});

it('points the back chevron outward, toward the edge it sits on', async () => {
  const r = await openProfile();

  // English: back sits on the right, so it points right.
  const back = r.getByTestId('profile-back');
  expect(back.findAllByType(ChevronRight)).toHaveLength(1);
  expect(back.findAllByType(ChevronLeft)).toHaveLength(0);
});

it('turns the chevron the other way in Hebrew, where back sits on the left', async () => {
  mockLanguage = 'he';
  const r = await openProfile();

  const back = r.getByTestId('profile-back');
  expect(back.findAllByType(ChevronLeft)).toHaveLength(1);
  expect(back.findAllByType(ChevronRight)).toHaveLength(0);
});
