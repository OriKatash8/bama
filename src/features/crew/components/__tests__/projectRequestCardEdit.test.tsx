import React from 'react';
import { render } from '@testing-library/react-native';
import { ProjectRequestCard } from '../ProjectRequestCard';
import type { ProjectRequest } from '@core/types/project';
import en from '@core/i18n/translations/en.json';

/**
 * Editing a project from My Projects belongs to the client only while the
 * crew is still empty. Once one professional fills a seat they joined on the
 * project as it stood, so the Edit button goes away — the same rule as delete.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
  useSegments: () => ['(client)'],
}));
jest.mock('@features/offers/hooks/useProjectTeam', () => ({
  useProjectTeam: () => ({ team: [], isLoading: false, load: jest.fn() }),
}));
jest.mock('@features/crew/services/projectCancellation', () => ({ cancelProject: jest.fn() }));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: () => ({ showToast: jest.fn() }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const EDIT = en.chats_page.edit_project;

const base = {
  id: 'p1',
  title: 'Shoot',
  status: 'open',
  location: 'Tel Aviv',
  deadline: '2099-12-31',
  exec: '2099-12-01',
  chatId: 'c1',
  crewSlots: [{ category: 'Editor', quantity: 2 }],
  filledSlots: [],
} as unknown as ProjectRequest;

const withCrew = {
  ...base,
  filledSlots: [{ professionalId: 'pro-1', category: 'Editor', slotIndex: 0 }],
} as unknown as ProjectRequest;

it('offers Edit on an open project nobody has joined', () => {
  const r = render(<ProjectRequestCard request={base} />);
  expect(r.queryByText(EDIT)).toBeTruthy();
});

it('drops Edit once one seat in the crew is filled', () => {
  const r = render(<ProjectRequestCard request={withCrew} />);
  expect(r.queryByText(EDIT)).toBeNull();
});
