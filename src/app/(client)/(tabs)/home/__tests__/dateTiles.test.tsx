import React from 'react';
import { render, fireEvent, within } from '@testing-library/react-native';
import HomeScreen from '../index';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * STEP 1'S DATE AND LOCATION TILES.
 *
 * One header ("Dates & location") with a single "?" that opens all three help
 * texts in a sheet, then three tiles. Every tile holds its icon and, at the
 * other top corner, either an "Optional" tag (empty) or a clear ✕ (filled);
 * underneath, the field name and "Choose" or the value.
 *
 * The end date is REQUIRED — step 1 will not advance without it — so its tile
 * never carries the "Optional" tag.
 */

let mockLanguage = 'en';
let mockQuantities: Record<string, number> = { 'Video Photographer': 1 };
const mockSetSlotCapability = jest.fn();

jest.mock('@features/crew/hooks', () => ({
  useCrewBuilder: () => ({
    // The real hook groups: one entry per (category, capability) carrying a
    // `quantity`, NOT one entry per person. The tray reads that quantity, so a
    // mock shaped per-person made it read undefined.
    slots: Object.entries(mockQuantities)
      .filter(([, q]) => q > 0)
      .map(([category, quantity]) => ({ category, quantity })),
    totalCount: Object.values(mockQuantities).reduce((a, b) => a + b, 0),
    roleQuantity: (cat: string) => mockQuantities[cat] ?? 0,
    slotCaps: (cat: string) => Array.from({ length: mockQuantities[cat] ?? 0 }, () => undefined),
    setQuantity: jest.fn(),
    setSlotCapability: mockSetSlotCapability,
    removeCategory: jest.fn(),
    loadSlots: jest.fn(),
  }),
}));

// Tagged so a test can tell WHICH picker opened, and drive a real selection
// through onSelect — the date squares are otherwise indistinguishable.
jest.mock('@features/crew/components', () => {
  const RN = jest.requireActual('react-native');
  return {
    MiniCalendar: ({ onSelect }: { onSelect: (iso: string) => void }) =>
      require('react').createElement(
        RN.TouchableOpacity,
        { testID: 'mini-calendar', onPress: () => onSelect(`${new Date().getFullYear()}-10-12`) },
        require('react').createElement(RN.Text, null, 'calendar'),
      ),
  };
});

jest.mock('@components/layout/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn() }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLanguage }),
}));
jest.mock('@core/haptics', () => ({
  tapFeedback: jest.fn(),
  commitFeedback: jest.fn(),
  warnFeedback: jest.fn(),
}));

jest.mock('react-native-reanimated', () => {
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View: RN.View, createAnimatedComponent: (C: unknown) => C },
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: (fn: () => unknown) => fn(),
    // DEFAULT: the callback is NEVER invoked — which is what Reanimated 4
    // actually does on web. The previous mock fired it synchronously with
    // `true`, so eight transition tests passed against behaviour no real
    // platform exhibits, and a screen that stranded on every web transition
    // shipped green. Nothing may depend on this callback.
    withSpring: (v: number) => v,
    runOnJS: (fn: unknown) => fn,
    useReducedMotion: () => false,
  };
});

const pressEvent = () => ({ stopPropagation: jest.fn() });
const b = en.builder;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuantities = { 'Video Photographer': 1 };
  mockLanguage = 'en';
});

function pickExec(r: ReturnType<typeof render>) {
  fireEvent.press(r.getByTestId('tile-exec'));
  fireEvent.press(r.getByTestId('mini-calendar'));
}

describe('empty tiles', () => {
  it('start date and location show the Optional tag and Choose, and no ✕', () => {
    const r = render(<HomeScreen />);
    for (const key of ['exec', 'location']) {
      const tile = within(r.getByTestId(`tile-${key}`));
      expect(tile.getByText(b.optional_tag)).toBeTruthy();
      expect(tile.getByText(b.choose)).toBeTruthy();
      expect(r.queryByTestId(`clear-${key}`)).toBeNull();
    }
  });

  it('the end date is required, so its tile has no Optional tag', () => {
    const r = render(<HomeScreen />);
    const tile = within(r.getByTestId('tile-deadline'));
    expect(tile.getByText(b.choose)).toBeTruthy();
    expect(tile.queryByText(b.optional_tag)).toBeNull();
  });

  it('names the field and says it is not selected', () => {
    const r = render(<HomeScreen />);
    expect(r.getByTestId('tile-exec').props.accessibilityLabel).toBe(`${b.start_date}, ${b.not_selected_a11y}`);
  });

  it('the old centred placeholders and "(optional)" notes are gone', () => {
    const r = render(<HomeScreen />);
    expect(r.queryByText(b.placeholder_date)).toBeNull();
    expect(r.queryByText(b.placeholder_deadline)).toBeNull();
    expect(r.queryByText(b.placeholder_location)).toBeNull();
    expect(r.queryByText(b.optional_note)).toBeNull();
  });
});

describe('filled tiles', () => {
  it('shows the value and a ✕, and no tag', () => {
    const r = render(<HomeScreen />);
    pickExec(r);

    const tile = within(r.getByTestId('tile-exec'));
    expect(tile.getByText('Oct 12')).toBeTruthy();
    expect(tile.queryByText(b.optional_tag)).toBeNull();
    expect(tile.queryByText(b.choose)).toBeNull();
    expect(r.getByTestId('clear-exec').props.accessibilityLabel).toBe(`Clear ${b.start_date}`);
    expect(r.getByTestId('tile-exec').props.accessibilityLabel).toBe(`${b.start_date}, Oct 12`);
  });

  it('renders the date in Hebrew as "12 באוק׳", with no weekday', () => {
    mockLanguage = 'he';
    const r = render(<HomeScreen />);
    pickExec(r);

    expect(within(r.getByTestId('tile-exec')).getByText('12 באוק׳')).toBeTruthy();
  });

  it('✕ clears the value without opening the picker', () => {
    const r = render(<HomeScreen />);
    pickExec(r);
    const ev = pressEvent();

    fireEvent.press(r.getByTestId('clear-exec'), ev);

    expect(ev.stopPropagation).toHaveBeenCalled();
    expect(r.queryByTestId('mini-calendar')).toBeNull();
    expect(r.queryByTestId('clear-exec')).toBeNull();
    expect(within(r.getByTestId('tile-exec')).getByText(b.optional_tag)).toBeTruthy();
  });

  it('shows only the first part of a typed address', () => {
    const r = render(<HomeScreen />);
    fireEvent.press(r.getByTestId('tile-location'));
    fireEvent.changeText(r.getByPlaceholderText(b.search_city), 'Rothschild 1, Tel Aviv');
    fireEvent.press(r.getByText('+ Add "Rothschild 1, Tel Aviv"'));

    expect(within(r.getByTestId('tile-location')).getByText('Rothschild 1')).toBeTruthy();
  });
});

describe('the single help', () => {
  it('replaces the three labels and three "?" with one header and one "?"', () => {
    const r = render(<HomeScreen />);
    expect(r.getByText(b.dates_location_title)).toBeTruthy();
    expect(r.getAllByLabelText(en.common.help)).toHaveLength(1);
  });

  it('opens a sheet with all three help texts', () => {
    const r = render(<HomeScreen />);
    expect(r.queryByText(b.help_execution)).toBeNull();

    fireEvent.press(r.getByLabelText(en.common.help));

    expect(r.getByText(b.help_execution)).toBeTruthy();
    expect(r.getByText(b.help_deadline)).toBeTruthy();
    expect(r.getByText(b.help_location)).toBeTruthy();
  });

  it('follows the language', () => {
    mockLanguage = 'he';
    const r = render(<HomeScreen />);
    fireEvent.press(r.getByLabelText(he.common.help));
    expect(r.getByText(he.builder.help_location)).toBeTruthy();
  });
});
