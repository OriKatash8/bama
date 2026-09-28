import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import CoursesAdmin from '../courses';

/**
 * The admin's courses page, in the admin dashboard's design. Firestore is faked
 * at the module boundary: refs carry their path so the writes can be pinned.
 */

let mockLang = 'en';
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
const mockToast = jest.fn();

jest.mock('react-native-reanimated', () => require('../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0 }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack, push: jest.fn() }),
}));
jest.mock('@core/navigation/floatingTabBar', () => ({ useTabBarClearance: () => 80, FLOATING_TAB_BAR_BOTTOM: 24 }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string; displayName: string } }) => unknown) =>
    s({ user: { id: 'admin-1', displayName: 'Dana Admin' } }),
}));
jest.mock('@core/stores/uiStore', () => ({
  useUiStore: (s?: (x: { showToast: jest.Mock }) => unknown) =>
    (s ? s({ showToast: mockToast }) : { showToast: mockToast }),
}));
jest.mock('@core/hooks/useVideoUpload', () => ({
  useVideoUpload: () => ({ uploading: false, processing: false, uploadVideo: jest.fn() }),
}));
jest.mock('@core/firebase/config', () => ({ db: {} }));

const mockData: Record<string, { id: string; data: Record<string, unknown> }[]> = {};
jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  doc: jest.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  query: jest.fn((ref: { path: string }) => ref),
  orderBy: jest.fn(),
  onSnapshot: jest.fn((q: { path: string }, next: (s: unknown) => void) => {
    next({ docs: (mockData[q.path] ?? []).map((d) => ({ id: d.id, data: () => d.data })) });
    return () => {};
  }),
  getCountFromServer: jest.fn(() => Promise.resolve({ data: () => ({ count: 5 }) })),
  addDoc: jest.fn(() => Promise.resolve({ id: 'new' })),
  updateDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  serverTimestamp: jest.fn(() => 'TS'),
  Timestamp: class {},
}));

const COURSE = {
  title: 'Lighting 101', description: 'Basics', price: 250, instructorName: 'Rona',
  videoUrl: '', published: true, createdAt: null,
};
const REQUEST = {
  title: 'Gaffer Pro', category: 'Lighting', courseUrl: 'https://x.test/c', instructorName: 'Avi',
  price: 400, description: 'Advanced rigging', submittedBy: 'u1', submittedByName: 'Avi', createdAt: null,
  level: 'advanced',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockLang = 'en';
  mockCanGoBack = true;
  mockData.courses = [
    { id: 'c1', data: COURSE },
    { id: 'c2', data: { ...COURSE, title: 'Sound Mixing', published: false, price: 90 } },
  ];
  mockData.courseRequests = [{ id: 'r1', data: REQUEST }];
});

afterEach(() => jest.useRealTimers());

async function renderPage() {
  const r = render(<CoursesAdmin />);
  await act(async () => {});
  return r;
}

it('titles the page with the Operations "Courses" label, in English', async () => {
  const r = await renderPage();
  expect(r.getByText(en.admin_operations.courses)).toBeTruthy();
  expect(r.getByTestId('dash-header')).toBeTruthy();
});

it('mirrors in Hebrew: the title aligns right and course rows run right to left', async () => {
  mockLang = 'he';
  const r = await renderPage();
  const title = StyleSheet.flatten(r.getByText(he.admin_operations.courses).props.style);
  expect(title.textAlign).toBe('right');
  expect(StyleSheet.flatten(r.getByTestId('course-c1').props.style).flexDirection).toBe('row-reverse');
  expect(StyleSheet.flatten(r.getByTestId('dash-header-row').props.style).flexDirection).toBe('row-reverse');
});

it('rows render from the courses snapshot, with price, instructor, status and clicks', async () => {
  const r = await renderPage();
  const row = within(r.getByTestId('course-c1'));
  expect(row.getByText('Lighting 101')).toBeTruthy();
  expect(row.getByText('₪250 · Rona')).toBeTruthy();
  expect(row.getByText('Live')).toBeTruthy();
  expect(within(r.getByTestId('clicks-c1')).getByText('5')).toBeTruthy();
  expect(within(r.getByTestId('course-c2')).getByText('Draft')).toBeTruthy();
  expect(StyleSheet.flatten(r.getByTestId('course-c1').props.style).flexDirection).toBe('row');
});

it('stat tiles carry the counts and a footer line under each number', async () => {
  const r = await renderPage();
  expect(r.getByTestId('tile-courses-value').props.accessibilityLabel).toBe('2');
  expect(r.getByTestId('tile-requests-value').props.accessibilityLabel).toBe('1');
  expect(within(r.getByTestId('tile-courses')).getByText(en.admin_dashboard.all_time)).toBeTruthy();
  expect(within(r.getByTestId('tile-requests')).getByText(en.admin_dashboard.attention)).toBeTruthy();
});

it('shows the empty state when there are no courses and no request card', async () => {
  mockData.courses = [];
  mockData.courseRequests = [];
  const r = await renderPage();
  expect(r.getByText(en.courses.empty)).toBeTruthy();
  expect(r.queryByTestId('requests-card')).toBeNull();
});

it('approving a request creates the course and removes the request', async () => {
  const r = await renderPage();
  expect(within(r.getByTestId('request-r1')).getByText('Lighting · ₪400')).toBeTruthy();
  await act(async () => { fireEvent.press(r.getByTestId('approve-r1')); });
  expect(addDoc).toHaveBeenCalledWith({ path: 'courses' }, {
    title: 'Gaffer Pro', description: 'Advanced rigging', price: 400, instructorName: 'Avi',
    courseUrl: 'https://x.test/c', videoUrl: '', published: true, createdAt: 'TS',
    category: 'Lighting', level: 'advanced',
  });
  expect(deleteDoc).toHaveBeenCalledWith({ path: 'courseRequests/r1' });
});

it('rejecting a request deletes it', async () => {
  const r = await renderPage();
  await act(async () => { fireEvent.press(r.getByTestId('reject-r1')); });
  expect(deleteDoc).toHaveBeenCalledWith({ path: 'courseRequests/r1' });
  expect(addDoc).not.toHaveBeenCalled();
});

it('Add Course opens the form and saving creates the course', async () => {
  const r = await renderPage();
  fireEvent.press(r.getByTestId('add-course'));
  fireEvent.changeText(r.getByPlaceholderText(en.courses.course_title_label), 'New One');
  fireEvent.changeText(r.getByPlaceholderText(en.courses.price_label), '120');
  await act(async () => { fireEvent.press(r.getByTestId('save-course')); });
  expect(addDoc).toHaveBeenCalledWith({ path: 'courses' }, {
    title: 'New One', description: '', price: 120, instructorName: '', videoUrl: '', published: false,
    createdAt: 'TS',
  });
  expect(mockToast).toHaveBeenCalledWith('Course created', 'success');
});

it('an empty title is refused without writing', async () => {
  const r = await renderPage();
  fireEvent.press(r.getByTestId('add-course'));
  await act(async () => { fireEvent.press(r.getByTestId('save-course')); });
  expect(addDoc).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith('Title is required', 'error');
});

it('editing a course updates that document', async () => {
  const r = await renderPage();
  fireEvent.press(r.getByTestId('edit-c1'));
  expect(r.getByDisplayValue('Lighting 101')).toBeTruthy();
  fireEvent.changeText(r.getByDisplayValue('Lighting 101'), 'Lighting 102');
  fireEvent(r.getByTestId('published-switch'), 'valueChange', false);
  await act(async () => { fireEvent.press(r.getByTestId('save-course')); });
  expect(updateDoc).toHaveBeenCalledWith({ path: 'courses/c1' }, {
    title: 'Lighting 102', description: 'Basics', price: 250, instructorName: 'Rona', videoUrl: '', published: false,
  });
  expect(mockToast).toHaveBeenCalledWith('Course updated', 'success');
});

it('delete asks first, then deletes the course', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const r = await renderPage();
  fireEvent.press(r.getByTestId('delete-c2'));
  expect(deleteDoc).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => Promise<void> }[];
  await act(async () => { await buttons.find((b) => b.text === 'Delete')!.onPress!(); });
  expect(deleteDoc).toHaveBeenCalledWith({ path: 'courses/c2' });
  alert.mockRestore();
});

it('back returns to the previous page, or to Operations when there is none', async () => {
  const r = await renderPage();
  fireEvent.press(r.getByTestId('admin-back'));
  expect(mockBack).toHaveBeenCalled();
  mockCanGoBack = false;
  fireEvent.press(r.getByTestId('admin-back'));
  expect(mockReplace).toHaveBeenCalledWith('/admin/operations');
});
