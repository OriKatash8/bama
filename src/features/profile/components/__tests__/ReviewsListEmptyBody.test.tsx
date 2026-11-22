import React from 'react';
import { render } from '@testing-library/react-native';
import { ReviewsList } from '../ReviewsList';
import type { Review } from '@core/types/project';

/**
 * The review comment is optional, so a stars-only review must not leave an
 * empty text row on the profile card; a review with a comment still shows it.
 */

jest.mock('lucide-react-native', () => ({ ChevronLeft: () => null, ChevronRight: () => null, Flag: () => null }));
jest.mock('@features/moderation/components/ReportDialog', () => ({ ReportDialog: () => null }));
jest.mock('@core/navigation/floatingTabBar', () => ({ useModeAccent: () => ({ accent: '#000', tint: '#fff' }) }));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'viewer' } }),
}));
jest.mock('@core/stores/blockStore', () => ({
  useBlockStore: (s: (x: { blocked: string[] }) => unknown) => s({ blocked: [] }),
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

function review(body: string): Review {
  return {
    id: 'r1', professionalId: 'p1', authorId: 'a1', authorName: 'Author', rating: 4, body,
    createdAt: { seconds: 1_700_000_000, nanoseconds: 0 } as Review['createdAt'],
    published: true,
  };
}

it('a stars-only review shows no comment row', () => {
  const utils = render(<ReviewsList reviews={[review('')]} />);
  expect(utils.queryByTestId('review-body')).toBeNull();
  expect(utils.getByText('★★★★☆')).toBeTruthy();
});

it('a whitespace-only comment (legacy data) shows no comment row', () => {
  const utils = render(<ReviewsList reviews={[review('   ')]} />);
  expect(utils.queryByTestId('review-body')).toBeNull();
});

it('a review with a comment still shows it', () => {
  const utils = render(<ReviewsList reviews={[review('Great to work with')]} />);
  expect(utils.getByTestId('review-body')).toBeTruthy();
  expect(utils.getByText('Great to work with')).toBeTruthy();
});
