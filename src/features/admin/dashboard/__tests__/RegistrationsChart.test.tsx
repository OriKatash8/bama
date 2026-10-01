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

// 24 hourly bars: a phone-wide plot prints a few x labels, a web-wide one prints all.
describe('x labels follow the plot width', () => {
  const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  const ones = HOURS.map(() => 1);
  const at = (width: number) => {
    const r = render(
      <RegistrationsChart labels={HOURS} total={ones} client={ones} pro={ones} view="total" onView={jest.fn()} period="daily" loading={false} />,
    );
    fireEvent(r.getByTestId('reg-plot'), 'layout', { nativeEvent: { layout: { width, height: 236 } } });
    const printed = r.getAllByTestId('x-label').map((n) => n.props.children).filter(Boolean);
    return { r, printed };
  };

  it('phone: thinned, newest kept, value labels only over labelled bars', () => {
    const { r, printed } = at(340);
    expect(printed.length).toBeLessThan(10);
    expect(printed).toContain('23:00');
    // Each value label ("1") sits over a labelled bar — no more of them than x labels.
    expect(r.getAllByText('1').length).toBeLessThanOrEqual(printed.length);
  });

  it('web: every hour labelled', () => {
    const { printed } = at(1100);
    expect(printed).toHaveLength(24);
  });
});
