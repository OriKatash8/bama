/**
 * "Add to calendar": the phone's own pre-filled "new event" sheet on iOS/Android
 * (expo-calendar, no permission needed for the system sheet), an .ics download on
 * web, and hidden on an app build that predates the native module.
 */

const mockCreate = jest.fn();
let mockNativeModule: object | null = {};
let mockOS = 'ios';

jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  __esModule: true,
  default: { get OS() { return mockOS; }, select: (o: Record<string, unknown>) => o[mockOS] ?? o.default },
}));
jest.mock('expo-modules-core', () => ({
  ...jest.requireActual('expo-modules-core'),
  requireOptionalNativeModule: () => mockNativeModule,
}));
jest.mock('expo-calendar/legacy', () => ({ createEventInCalendarAsync: (...a: unknown[]) => mockCreate(...a) }));

import { canAddToCalendar, addMeetingToCalendar } from '../addMeetingToCalendar';

const meeting = {
  id: 'm1', projectId: 'p1', title: 'Location scout', date: '2026-10-05', time: '10:00', durationMinutes: 30,
  location: 'Herzl 1', link: 'https://zoom.us/j/1', description: 'Bring a camera',
  invitedIds: [], createdBy: 'u1', createdAt: null as never,
};

beforeEach(() => { jest.clearAllMocks(); mockNativeModule = {}; mockOS = 'ios'; });

it('native: opens the system sheet pre-filled', async () => {
  mockCreate.mockResolvedValue({ action: 'saved', id: 'e1' });
  await addMeetingToCalendar(meeting);
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Location scout',
    startDate: new Date(2026, 9, 5, 10, 0),
    endDate: new Date(2026, 9, 5, 10, 30),
    allDay: false,
    location: 'Herzl 1',
    notes: 'Bring a camera\nhttps://zoom.us/j/1',
    url: 'https://zoom.us/j/1',
  }));
});

it('native: available only when the build has the calendar module', () => {
  expect(canAddToCalendar()).toBe(true);
  mockNativeModule = null;
  expect(canAddToCalendar()).toBe(false);
});

it('web: always available, and downloads an .ics file', async () => {
  mockOS = 'web';
  mockNativeModule = null;
  expect(canAddToCalendar()).toBe(true);

  const click = jest.fn();
  const anchor = { click, href: '', download: '', remove: jest.fn() };
  const created: Blob[] = [];
  (global as unknown as { document: unknown }).document = {
    createElement: () => anchor,
    body: { appendChild: jest.fn() },
  };
  (global as unknown as { URL: unknown }).URL = {
    createObjectURL: (b: Blob) => { created.push(b); return 'blob:x'; },
    revokeObjectURL: jest.fn(),
  };

  await addMeetingToCalendar(meeting);
  expect(mockCreate).not.toHaveBeenCalled();
  expect(click).toHaveBeenCalled();
  expect(anchor.download).toBe('meeting.ics');
  expect(created[0].type).toBe('text/calendar;charset=utf-8');
  expect(await created[0].text()).toContain('SUMMARY:Location scout');
});
