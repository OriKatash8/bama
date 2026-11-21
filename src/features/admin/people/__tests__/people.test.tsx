import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { personName } from '../personName';
import { loadUserDirectory, resetUserDirectory, useUserDirectory } from '../userDirectory';
import { UserMoreButton } from '../UserMoreButton';

/**
 * People in the admin panel: shown by full name (never the uid), with a ⋮ for the rest.
 */
let mockLang = 'en';
const mockPush = jest.fn();
const mockListUsers = jest.fn();
const mockGetDocument = jest.fn();
const mockActivity = jest.fn();

jest.mock('react-native-reanimated', () => require('../../../../testing/reanimatedMock').reanimatedMock());
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0 }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/firebase/functions', () => ({
  callFunction: (name: string) => (args: unknown) =>
    (name === 'adminListUsers' ? mockListUsers() : name === 'adminUserActivity' ? mockActivity(args) : Promise.reject(new Error(name))),
}));
jest.mock('@core/firebase/firestore', () => ({ getDocument: (path: string) => mockGetDocument(path) }));

const DIRECTORY = [
  { uid: 'u1', displayName: 'Noa Levi', email: 'noa@example.com', disabled: false, createdAt: 1 },
  { uid: 'u2', displayName: '', email: 'nameless@example.com', disabled: false, createdAt: 1 },
];

const SUMMARY = {
  moderation: { actions: 2, reportsReceived: 1, reportsFiled: 0 }, projects: { asClient: 1, asProfessional: 1 },
  fees: { records: 1, open: 1, owed: 90, blockedFrom: null }, disputes: { open: 1, resolved: 0 },
  reviews: { received: 0, given: 0, held: 0 }, communities: { owned: 0, member: 0 },
};
const CALM = { ...SUMMARY, moderation: { actions: 0, reportsReceived: 0, reportsFiled: 0 }, fees: { records: 0, open: 0, owed: 0, blockedFrom: null }, disputes: { open: 0, resolved: 0 } };

beforeEach(() => {
  jest.clearAllMocks();
  resetUserDirectory();
  mockLang = 'en';
  mockListUsers.mockResolvedValue({ users: DIRECTORY, truncated: false });
  mockActivity.mockResolvedValue({ section: 'summary', summary: SUMMARY });
  mockGetDocument.mockImplementation((path: string) => {
    if (path === 'users/u1') return Promise.resolve({ displayName: 'Noa Levi', createdAt: { seconds: 1_700_000_000 } });
    if (path === 'users/u1/private/contact') return Promise.resolve({ phone: '+972501234567' });
    return Promise.resolve(null);
  });
});

describe('personName', () => {
  it('is the full name, trimmed', () => {
    expect(personName('  Noa Levi ', 'Unknown user')).toBe('Noa Levi');
  });
  it.each([[''], ['   '], [undefined], [null]])('is the fallback for %p', (n) => {
    expect(personName(n as never, 'Unknown user')).toBe('Unknown user');
  });
  it('treats a name that IS the uid as unknown: a uid is never a label', () => {
    expect(personName('AbC123uid', 'Unknown user', 'AbC123uid')).toBe('Unknown user');
    expect(personName('Noa', 'Unknown user', 'AbC123uid')).toBe('Noa');
  });
});

describe('the user directory', () => {
  function Probe({ enabled = true }: { enabled?: boolean }) {
    const d = useUserDirectory(enabled);
    return <Text testID="p">{`${d.ready}|${d.nameOf('u1')}|${d.nameOf('u2')}|${d.emailOf('u1')}|${d.nameOf('nobody')}`}</Text>;
  }

  it('loads everyone with ONE call, however many screens ask, and gives names and emails', async () => {
    const a = render(<Probe />);
    const b = render(<Probe />);
    await act(async () => {});
    expect(mockListUsers).toHaveBeenCalledTimes(1);
    expect(a.getByTestId('p').props.children).toBe('true|Noa Levi||noa@example.com|');
    expect(b.getByTestId('p').props.children).toBe('true|Noa Levi||noa@example.com|');
  });

  it('does not call the server while disabled', async () => {
    render(<Probe enabled={false} />);
    await act(async () => {});
    expect(mockListUsers).not.toHaveBeenCalled();
  });

  it('a failed load is reported once and is not cached: the next screen retries', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockListUsers.mockRejectedValueOnce(new Error('offline'));
    const first = render(<Probe />);
    await act(async () => {});
    expect(first.getByTestId('p').props.children).toBe('true|||null|');
    await expect(loadUserDirectory()).resolves.toBeInstanceOf(Map);
    expect(mockListUsers).toHaveBeenCalledTimes(2);
  });
});

describe('the ⋮ details', () => {
  const open = async (uid = 'u1', name = 'Noa Levi') => {
    const r = render(<UserMoreButton uid={uid} name={name} />);
    await act(async () => { fireEvent.press(r.getByTestId(`user-more-${uid}`)); });
    await act(async () => {});
    return r;
  };

  it('is labelled for a screen reader with the person it is about', () => {
    const r = render(<UserMoreButton uid="u1" name="Noa Levi" />);
    expect(r.getByLabelText(`${en.admin_people.more_details} · Noa Levi`)).toBeTruthy();
  });

  it('asks the server for nothing until it is opened', async () => {
    render(<UserMoreButton uid="u1" name="Noa Levi" />);
    await act(async () => {});
    expect(mockListUsers).not.toHaveBeenCalled();
    expect(mockGetDocument).not.toHaveBeenCalled();
    expect(mockActivity).not.toHaveBeenCalled();
  });

  it('shows name, email, phone, id, joined and standing, each copyable where it is a value', async () => {
    const r = await open();
    const d = (k: string) => r.getByTestId(`user-details-u1-${k}`);
    expect(d('name').props.children).toBe('Noa Levi');
    expect(d('email').props.children).toBe('noa@example.com');
    expect(d('email').props.selectable).toBe(true);
    expect(d('phone').props.selectable).toBe(true);
    expect(d('uid').props.children).toBe('u1');
    expect(d('uid').props.selectable).toBe(true);
    expect(d('joined').props.children).not.toBe('—');
    expect(d('standing').props.children).toBe(en.admin_people.standing_active);
    expect(mockGetDocument).toHaveBeenCalledWith('users/u1/private/contact');
  });

  it('says there is no phone / email rather than showing a blank, and falls back to "Unknown user"', async () => {
    const r = render(<UserMoreButton uid="u2" />);
    await act(async () => { fireEvent.press(r.getByTestId('user-more-u2')); });
    await act(async () => {});
    expect(r.getByTestId('user-details-u2-name').props.children).toBe(en.admin_people.unknown_user);
    expect(r.getByTestId('user-details-u2-phone').props.children).toBe(en.admin_people.no_phone);
    // The id is the one place a uid is shown, and it is there to be copied.
    expect(r.getByTestId('user-details-u2-uid').props.children).toBe('u2');
  });

  it('shows a warning or suspension with its reason', async () => {
    mockGetDocument.mockImplementation((path: string) => Promise.resolve(
      path === 'users/u1' ? { displayName: 'Noa Levi', moderation: { status: 'suspended', reason: 'Spam' } } : null,
    ));
    const r = await open();
    expect(r.getByTestId('user-details-u1-standing').props.children).toBe(`${en.admin_people.standing_suspended} · Spam`);
  });

  it('"Open in Users" goes to that user in the Users screen', async () => {
    const r = await open();
    await act(async () => { fireEvent.press(r.getByTestId('user-details-u1-open-users')); });
    expect(mockPush).toHaveBeenCalledWith('/admin/users?uid=u1');
  });

  it('a failed read says so instead of showing an empty sheet', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetDocument.mockRejectedValue(new Error('denied'));
    const r = await open();
    expect(r.getByText(en.admin_people.load_failed)).toBeTruthy();
  });

  describe('the activity line', () => {
    it('says what deserves a look, in one line, from ONE summary call', async () => {
      const r = await open();
      expect(mockActivity).toHaveBeenCalledTimes(1);
      expect(mockActivity).toHaveBeenCalledWith({ uid: 'u1', section: 'summary' });
      const line = r.getByTestId('activity-line').props.children as string;
      expect(line).toContain(en.admin_activity.summary_owed.replace('{{n}}', '90'));
      expect(line).toContain(en.admin_activity.summary_disputes.replace('{{n}}', '1'));
      expect(line).toContain(en.admin_activity.summary_actions.replace('{{n}}', '2'));
      expect(line).toContain(en.admin_activity.summary_reports.replace('{{n}}', '1'));
    });

    it('"Open full activity" lands on the tab most worth opening: disputes first, then payments, else moderation', async () => {
      const r = await open();
      await act(async () => { fireEvent.press(r.getByTestId('activity-open')); });
      expect(mockPush).toHaveBeenCalledWith('/admin/users?uid=u1&section=disputes');

      mockActivity.mockResolvedValue({ section: 'summary', summary: { ...SUMMARY, disputes: { open: 0, resolved: 0 } } });
      const owes = await open();
      await act(async () => { fireEvent.press(owes.getByTestId('activity-open')); });
      expect(mockPush).toHaveBeenLastCalledWith('/admin/users?uid=u1&section=fees');

      mockActivity.mockResolvedValue({ section: 'summary', summary: CALM });
      const calm = await open();
      expect(calm.getByText(en.admin_activity.summary_none)).toBeTruthy();
      await act(async () => { fireEvent.press(calm.getByTestId('activity-open')); });
      expect(mockPush).toHaveBeenLastCalledWith('/admin/users?uid=u1&section=moderation');
    });

    it('a failed summary says so and the rest of the sheet still works', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockActivity.mockRejectedValue(new Error('offline'));
      const r = await open();
      expect(r.getByTestId('activity-line-failed')).toBeTruthy();
      expect(r.getByTestId('user-details-u1-email').props.children).toBe('noa@example.com');
    });
  });

  it('is translated: every English key has a Hebrew one', () => {
    for (const k of Object.keys(en.admin_people)) expect(he.admin_people).toHaveProperty(k);
    expect(he.admin_people.unknown_user).not.toBe(en.admin_people.unknown_user);
  });
});
