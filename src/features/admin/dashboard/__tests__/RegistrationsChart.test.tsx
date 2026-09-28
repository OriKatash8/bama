import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import { RegistrationsChart } from '../components/RegistrationsChart';

jest.mock('react-native-reanimated', () => require('../../../../testing/reanimatedMock').reanimatedMock());
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const E = en.admin_dashboard;
const LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DATA = { labels: LABELS, total: [1, 0, 3, 2, 0, 4, 5], client: [1, 0, 2, 2, 0, 3, 4], pro: [0, 0, 2, 1, 0, 1, 2] };

function renderChart(props: Partial<React.ComponentProps<typeof RegistrationsChart>> = {}) {
  const onView = jest.fn();
  const r = render(
    <RegistrationsChart {...DATA} view="total" onView={onView} period="daily" loading={false} {...props} />,
  );
  fireEvent(r.getByTestId('reg-plot'), 'layout', { nativeEvent: { layout: { width: 360, height: 236 } } });
  return { ...r, onView };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('draws one bar per day in the total view', () => {
  const r = renderChart();
  expect(r.getAllByTestId(/^reg-bar-total-/)).toHaveLength(7);
  expect(r.queryAllByTestId(/^reg-bar-client-/)).toHaveLength(0);
});

it('draws a client bar and a pro bar per day by mode, with a legend carrying each total', () => {
  const r = renderChart({ view: 'by_mode' });
  expect(r.getAllByTestId(/^reg-bar-client-/)).toHaveLength(7);
  expect(r.getAllByTestId(/^reg-bar-pro-/)).toHaveLength(7);
  expect(r.getByText(`${en.mode_picker.client} · 12`)).toBeTruthy();
  expect(r.getByText(`${en.mode_picker.professional} · 6`)).toBeTruthy();
});

it('the taller count draws the taller bar', () => {
  const r = renderChart();
  // Let the bars finish growing.
  act(() => jest.advanceTimersByTime(2000));
  const h = (i: number) => r.getByTestId(`reg-bar-total-${i}`).props.height;
  expect(h(6)).toBeGreaterThan(h(0));
});

it('says so over an empty plot instead of drawing bars', () => {
  const zeros = [0, 0, 0, 0, 0, 0, 0];
  const r = renderChart({ total: zeros, client: zeros, pro: zeros });
  expect(r.getByText(E.no_data)).toBeTruthy();
  expect(r.queryAllByTestId(/^reg-bar-/)).toHaveLength(0);
});

it('switches between total and by-mode from the card header', () => {
  const r = renderChart();
  expect(r.getByTestId('reg-view-total').props.accessibilityState.selected).toBe(true);
  fireEvent.press(r.getByTestId('reg-view-by_mode'));
  expect(r.onView).toHaveBeenCalledWith('by_mode');
});

it('names the period it shows', () => {
  expect(renderChart().getByText(E.sub_daily)).toBeTruthy();
  expect(renderChart({ period: 'weekly' }).getByText(E.sub_weekly)).toBeTruthy();
});
