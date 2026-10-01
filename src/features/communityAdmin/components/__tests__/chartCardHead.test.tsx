import { StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ChartCard } from '../ChartParts';

let mockLang = 'en';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));

// On a phone the head can't hold title + sub + control in one line: it must wrap
// (nothing cut off) and keep the control at the far end, as it sits on web.
const head = (lang: string) => {
  mockLang = lang;
  const r = render(
    <ChartCard title="Money flow" sub="by source" side={<Text testID="ctl">ctl</Text>}>
      <Text>body</Text>
    </ChartCard>,
  );
  const style = (id: string) => StyleSheet.flatten(r.getByTestId(id).props.style);
  return { side: style('chart-side'), row: style('chart-head'), r };
};

it('wraps instead of squeezing the sub out, the control at the far end', () => {
  const { side, row, r } = head('en');
  expect(row.flexWrap).toBe('wrap');
  expect(side.marginLeft).toBe('auto');
  expect(r.getByText('by source')).toBeTruthy();
});

it('mirrors in Hebrew: the far end is the left', () => {
  const { side, row } = head('he');
  expect(row.flexDirection).toBe('row-reverse');
  expect(side.marginRight).toBe('auto');
});
