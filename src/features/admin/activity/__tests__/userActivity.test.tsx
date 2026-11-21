import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { UserActivity } from '../UserActivity';

/**
 * A person's activity, section by section, at phone width. adminUserActivity is faked by section.
 */
let mockLang = 'en';
const mockPush = jest.fn();
const mockActivity = jest.fn();

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 375, height: 667, scale: 2, fontScale: 1 }),
}));
jest.mock('react-native-reanimated', () => require('../../../../testing/reanimatedMock').reanimatedMock());
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0 }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn(() => Promise.resolve(null)) }));
jest.mock('@core/firebase/functions', () => ({
  callFunction: (name: string) => (args: unknown) => (name === 'adminUserActivity' ? mockActivity(args) : Promise.resolve({ users: [], truncated: false })),
}));

const A = en.admin_activity;
const SUMMARY = {
  moderation: { actions: 1, reportsReceived: 1, reportsFiled: 0 }, projects: { asClient: 1, asProfessional: 1 },
  fees: { records: 1, open: 1, owed: 40, blockedFrom: Date.UTC(2026, 10, 20) }, disputes: { open: 1, resolved: 0 },
  reviews: { received: 1, given: 1, held: 1 }, communities: { owned: 1, member: 2 },
};
const page = (section: string, items: unknown[], extra: Record<string, unknown> = {}) =>
  ({ section, items, nextCursor: null, total: items.length, truncated: false, ...extra });
const DATA: Record<string, unknown> = {
  moderation: page('moderation', [
    { kind: 'action', id: 'a1', at: Date.UTC(2026, 10, 3), action: 'warn', reason: 'Spam', actorName: 'Admin', reportId: null },
    { kind: 'report_received', id: 'rp1', at: Date.UTC(2026, 10, 4), type: null, targetType: 'message', reason: 'Rude', snippet: 'you are awful', status: 'pending', other: { uid: 'r1', name: 'Rita Reporter' } },
  ]),
  projects: page('projects', [
    { projectId: 'pA', title: 'Wedding', status: 'completed', roles: ['professional'], at: 1, completedAt: Date.UTC(2026, 10, 6), chatId: 'chA', others: [{ uid: 'c1', name: 'Cleo Client' }], engagement: { status: 'disputed', amount: 1000 } },
    { projectId: 'pB', title: '', status: 'open', roles: ['client', 'professional'], at: 2, completedAt: null, chatId: null, others: [{ uid: 'p2', name: '' }], engagement: null },
  ]),
  fees: page('fees', [{
    projectId: 'pA', title: 'Wedding', at: 1, engagementStatus: 'completed', status: 'pending', baseAmount: 1000, feeDue: 30, paidAmount: 0, feePaid: false,
    paidAt: null, paidBy: null, chargeState: null, chargeDueAt: null, overdueAt: null, providerRef: 'ref-9',
    paymentLink: { processId: 'proc-77', amount: 30, createdAt: Date.UTC(2026, 10, 8), superseded: false }, review: 'link_amount_mismatch',
  }], { summary: { owed: 40, open: 1, paid: 0, blockedFrom: Date.UTC(2026, 10, 20) } }),
  disputes: page('disputes', [{
    projectId: 'pA', title: 'Wedding', at: 3, role: 'professional', pro: { uid: 'u1', name: '' }, state: 'open', reason: 'didnt_happen',
    note: 'never happened', outcome: null, resolvedAt: null, originalFee: 30, heldReview: { rating: 2, text: 'He never came', authorName: 'Cleo' },
  }]),
  reviews: page('reviews', [
    { id: 'rv1', at: 1, direction: 'received', rating: 5, text: 'great', published: false, held: true, projectId: 'pA', other: { uid: 'c1', name: 'Cleo Client' } },
    { id: 'rv2', at: 2, direction: 'given', rating: 4, text: 'ok', published: true, held: false, projectId: 'pB', other: { uid: 'p2', name: 'Pablo' } },
  ]),
  communities: page('communities', [{ id: 'cm1', name: 'Gaffers', role: 'owner', status: 'active', memberCount: 12, at: 1 }]),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = 'en';
  mockActivity.mockImplementation(({ section }: { section: string }) =>
    Promise.resolve(section === 'summary' ? { section, summary: SUMMARY } : DATA[section]));
});

async function open(section = 'moderation', lang = 'en') {
  mockLang = lang;
  const r = render(<UserActivity uid="u1" initialSection={section as never} />);
  await act(async () => {});
  return r;
}

it('shows every tab with its count, and the tab bar scrolls', async () => {
  const r = await open();
  expect(r.getByTestId('activity-tab-scroll')).toBeTruthy();
  expect(r.getByText(`${A.tab_moderation} (2)`)).toBeTruthy();
  expect(r.getByText(`${A.tab_projects} (2)`)).toBeTruthy();
  expect(r.getByText(`${A.tab_communities} (2)`)).toBeTruthy();
});

it('moderation: actions and reports, the other person by name with a ⋮, and the report text copyable', async () => {
  const r = await open();
  const rep = within(r.getByTestId('activity-moderation-rp1'));
  expect(rep.getByText(A.report_by.replace('{{name}}', 'Rita Reporter'))).toBeTruthy();
  expect(rep.getByText('you are awful').props.selectable).toBe(true);
  expect(r.getByTestId('user-more-r1')).toBeTruthy();
  expect(within(r.getByTestId('activity-moderation-a1')).getByText(A.by.replace('{{name}}', 'Admin'))).toBeTruthy();
});

it('projects: roles, the engagement, counterparties by name (never a uid), "Untitled project", and the chat button', async () => {
  const r = await open('projects');
  const a = within(r.getByTestId('activity-projects-pA'));
  expect(a.getByText('Cleo Client')).toBeTruthy();
  expect(a.getByText(A.engagement_line.replace('{{status}}', 'disputed').replace('{{amount}}', '1,000'))).toBeTruthy();
  expect(a.getByText(A.role_professional)).toBeTruthy();
  fireEvent.press(r.getByTestId('activity-chat-pA'));
  expect(mockPush).toHaveBeenCalledWith('/admin/project-chat?chatId=chA&projectId=pA');
  const b = within(r.getByTestId('activity-projects-pB'));
  expect(b.getByText(en.admin_people.untitled_project)).toBeTruthy();
  expect(b.getByText(en.admin_people.unknown_user)).toBeTruthy();
  expect(b.queryByText('p2')).toBeNull();
  expect(b.getByText(A.role_client)).toBeTruthy();
  expect(r.queryByTestId('activity-chat-pB')).toBeNull();
});

it('payments: the summary line, amounts, link and references (copyable), and a review reason', async () => {
  const r = await open('fees');
  expect(r.getByTestId('activity-fees-summary').props.children).toContain('₪40');
  const fee = within(r.getByTestId('activity-fees-pA'));
  expect(fee.getByText(A.fee_amounts.replace('{{base}}', '1,000').replace('{{due}}', '30').replace('{{paid}}', '0'))).toBeTruthy();
  expect(fee.getByText(A.process_line.replace('{{id}}', 'proc-77')).props.selectable).toBe(true);
  expect(fee.getByText(A.ref_line.replace('{{ref}}', 'ref-9')).props.selectable).toBe(true);
  expect(fee.getByText(en.admin_fees.charge_reason_link_amount_mismatch)).toBeTruthy();
  expect(fee.getByText(A.fee_unpaid)).toBeTruthy();
});

it('disputes: the held review (stars, text, author), the note and the original fee; an unnamed professional is "Unknown user"', async () => {
  const r = await open('disputes');
  const d = within(r.getByTestId('activity-disputes-pA-u1'));
  expect(d.getByText('He never came')).toBeTruthy();
  expect(d.getAllByTestId('star-filled')).toHaveLength(2);
  expect(d.getByText('never happened')).toBeTruthy();
  expect(d.getByText(A.original_fee.replace('{{n}}', '30'))).toBeTruthy();
  expect(d.getByText(en.admin_fees.pro_label.replace('{{name}}', en.admin_people.unknown_user))).toBeTruthy();
  expect(d.getByText(en.admin_fees.reason_didnt_happen)).toBeTruthy();
});

it('reviews and communities', async () => {
  const r = await open('reviews');
  expect(within(r.getByTestId('activity-reviews-rv1')).getByText(A.held)).toBeTruthy();
  expect(within(r.getByTestId('activity-reviews-rv2')).getByText(A.direction_given)).toBeTruthy();
  fireEvent.press(r.getByTestId('activity-tab-communities'));
  await act(async () => {});
  const c = within(r.getByTestId('activity-communities-cm1'));
  expect(c.getByText('Gaffers')).toBeTruthy();
  expect(c.getByText(A.role_owner)).toBeTruthy();
});

describe('paging', () => {
  it('"Load more" asks for the next page with the cursor and appends it', async () => {
    mockActivity.mockImplementation(({ section, cursor }: { section: string; cursor?: string }) => {
      if (section === 'summary') return Promise.resolve({ section, summary: SUMMARY });
      return Promise.resolve(cursor
        ? page('communities', [{ id: 'cm2', name: 'Grips', role: 'member', status: 'suspended', memberCount: 3, at: 0 }])
        : { ...page('communities', [{ id: 'cm1', name: 'Gaffers', role: 'owner', status: 'active', memberCount: 12, at: 1 }]), nextCursor: '20', total: 2 });
    });
    const r = await open('communities');
    expect(r.queryByTestId('activity-communities-cm2')).toBeNull();
    await act(async () => { fireEvent.press(r.getByTestId('activity-more-communities')); });
    expect(mockActivity).toHaveBeenCalledWith({ uid: 'u1', section: 'communities', cursor: '20' });
    expect(r.getByTestId('activity-communities-cm1')).toBeTruthy();
    expect(r.getByTestId('activity-communities-cm2')).toBeTruthy();
    expect(r.queryByTestId('activity-more-communities')).toBeNull(); // no further page
  });

  it('a failed "Load more" says so and keeps what is already shown', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockActivity.mockImplementation(({ section, cursor }: { section: string; cursor?: string }) => {
      if (section === 'summary') return Promise.resolve({ section, summary: SUMMARY });
      if (cursor) return Promise.reject(new Error('offline'));
      return Promise.resolve({ ...page('communities', [{ id: 'cm1', name: 'Gaffers', role: 'owner', status: 'active', memberCount: 12, at: 1 }]), nextCursor: '20', total: 40 });
    });
    const r = await open('communities');
    await act(async () => { fireEvent.press(r.getByTestId('activity-more-communities')); });
    expect(r.getByText(A.more_failed)).toBeTruthy();
    expect(r.getByTestId('activity-communities-cm1')).toBeTruthy();
  });

  it('says when the newest rows are shown because the server cap was hit', async () => {
    mockActivity.mockImplementation(({ section }: { section: string }) => Promise.resolve(section === 'summary'
      ? { section, summary: SUMMARY }
      : { ...page('communities', [{ id: 'cm1', name: 'Gaffers', role: 'owner', status: 'active', memberCount: 1, at: 1 }]), truncated: true, total: 200 }));
    const r = await open('communities');
    expect(r.getByText(A.truncated.replace('{{n}}', '200'))).toBeTruthy();
  });
});

describe('failures and empties', () => {
  it('a failed section shows an error with a retry (not "nothing"), and retry reloads it', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockActivity.mockImplementation(({ section }: { section: string }) =>
      (section === 'projects' ? Promise.reject(new Error('boom')) : Promise.resolve(section === 'summary' ? { section, summary: SUMMARY } : DATA[section])));
    const r = await open('projects');
    expect(r.getByTestId('activity-error-projects')).toBeTruthy();
    expect(r.queryByTestId('activity-empty-projects')).toBeNull();
    mockActivity.mockImplementation(({ section }: { section: string }) => Promise.resolve(section === 'summary' ? { section, summary: SUMMARY } : DATA[section]));
    await act(async () => { fireEvent.press(r.getByTestId('activity-retry-projects')); });
    expect(r.getByTestId('activity-projects-pA')).toBeTruthy();
  });

  it('a failed summary leaves the tabs usable, with a dash for the count', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockActivity.mockImplementation(({ section }: { section: string }) =>
      (section === 'summary' ? Promise.reject(new Error('x')) : Promise.resolve(DATA[section])));
    const r = await open();
    expect(r.getByText(`${A.tab_projects} (–)`)).toBeTruthy();
    expect(r.getByTestId('activity-moderation-a1')).toBeTruthy();
  });

  it('a client has no fees: the empty text says fees are for professionals', async () => {
    mockActivity.mockImplementation(({ section }: { section: string }) =>
      Promise.resolve(section === 'summary' ? { section, summary: SUMMARY } : page(section, [])));
    const r = await open('fees');
    expect(r.getByText(`${A.empty_fees} ${A.fees_clients_note}`)).toBeTruthy();
  });
});

it('Hebrew: rows run right to left and the strings exist for every key', async () => {
  const r = await open('projects', 'he');
  expect(StyleSheet.flatten(r.getByTestId('activity-projects-pA').props.style).flexDirection).toBe('row-reverse');
  for (const k of Object.keys(en.admin_activity)) expect(he.admin_activity).toHaveProperty(k);
});
