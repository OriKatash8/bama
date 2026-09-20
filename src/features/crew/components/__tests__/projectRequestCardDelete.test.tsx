import React from 'react';
import { render } from '@testing-library/react-native';
import { ProjectRequestCard } from '../ProjectRequestCard';
import type { ProjectRequest } from '@core/types/project';

/**
 * Deleting a project belongs to the client only while the project is still
 * empty. The moment one professional fills a seat, the crew has a stake in it,
 * so the ⋯ menu — whose only item is the delete — goes away with the delete.
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

it('offers the ⋯ menu while no professional has joined', () => {
  const r = render(<ProjectRequestCard request={base} />);
  expect(r.queryByTestId('project-more')).toBeTruthy();
});

it('drops the ⋯ menu, and with it the delete, once one seat is filled', () => {
  const r = render(<ProjectRequestCard request={withCrew} />);
  expect(r.queryByTestId('project-more')).toBeNull();
});
