import React from 'react';
import { render, act } from '@testing-library/react-native';
import ReportsAdmin from '../reports';
import { onSnapshot } from 'firebase/firestore';
import en from '@core/i18n/translations/en.json';

/**
 * A community owner's "ask to delete the community" arrives on the Reports page
 * as a report with type 'community_deletion'. It reads as a deletion request for
 * that community, with the owner's reason, and offers no warn / suspend: there is
 * no reported user to act on.
 */

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@core/firebase/config', () => ({ db: {} }));
jest.mock('@core/firebase/functions', () => ({ callFunction: () => jest.fn() }));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: () => ({ showToast: jest.fn() }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), query: jest.fn(), orderBy: jest.fn(), onSnapshot: jest.fn(),
  updateDoc: jest.fn(), doc: jest.fn(),
  getDoc: jest.fn(() => Promise.resolve({ data: () => ({ displayName: 'Olive Owner' }) })),
  Timestamp: class {},
}));

const docs = [
  {
    id: 'r1',
    data: {
      type: 'community_deletion', reporterId: 'owner-1', communityId: 'c1', communityName: 'Gaffers Guild',
      reason: 'We finished the season', evidenceURLs: [], status: 'pending', createdAt: null,
    },
  },
  {
    id: 'r2',
    data: {
      reporterId: 'u5', reportedUserId: 'bad-1', reportedUserName: 'Bad Actor',
      reason: 'Spam in chat over and over', evidenceURLs: [], status: 'pending', createdAt: null,
    },
  },
];

beforeEach(() => {
  (onSnapshot as jest.Mock).mockImplementation((_q, next: (s: unknown) => void) => {
    next({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) });
    return () => {};
  });
});

it('shows a deletion request with the community and reason, and no warn or suspend for it', async () => {
  const r = render(<ReportsAdmin />);
  await act(async () => {});
  expect(r.getByText(`${en.admin_reports.community_deletion} · Gaffers Guild`)).toBeTruthy();
  expect(r.getByText('We finished the season')).toBeTruthy();
  // Only the ordinary user report carries moderation actions.
  expect(r.getAllByText(en.admin_reports.warn)).toHaveLength(1);
  expect(r.getAllByText(en.admin_reports.suspend)).toHaveLength(1);
  expect(r.getByText('Bad Actor')).toBeTruthy();
  expect(r.queryByText(en.admin_reports.unknown_user)).toBeNull();
});
