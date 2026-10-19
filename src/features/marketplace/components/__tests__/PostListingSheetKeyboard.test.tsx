import React from 'react';
import { Dimensions, Keyboard, Platform, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { PostListingSheet } from '../PostListingSheet';
import { CityPickerModal } from '../CityPickerModal';
import en from '@core/i18n/translations/en.json';

/**
 * The add-listing popup is a Modal (its own window), so the screen's keyboard handling does not
 * reach it. With the keyboard up the card is lifted into the space above it, the header and the
 * pinned Publish/Save button stay, and the form between them scrolls. The same goes for the city
 * picker. Web has no virtual keyboard and stays as it was.
 */

jest.mock('../../hooks/useCreateListing', () => ({ useCreateListing: () => ({ create: jest.fn(), isSubmitting: false }) }));
jest.mock('../../hooks/useUpdateListing', () => ({ useUpdateListing: () => ({ update: jest.fn(), isSubmitting: false }) }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: () => ({ showToast: jest.fn() }) }));
let mockLang = 'en';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
// The sheet embeds the city picker; it is tested on its own below.
jest.mock('../CityPickerModal', () => {
  const actual = jest.requireActual('../CityPickerModal');
  return { CityPickerModal: actual.CityPickerModal };
});

const setOS = (os: string) => { (Platform as { OS: string }).OS = os; };
type Handler = (e: { endCoordinates: { height: number; screenY: number } }) => void;
const HEIGHT = 667;

function setup() {
  const handlers: Record<string, Handler> = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((ev: string, cb: Handler) => {
    handlers[ev] = cb;
    return { remove: jest.fn() };
  }) as never);
  jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 390, height: HEIGHT, scale: 2, fontScale: 1 });
  const showKeyboard = (height: number) =>
    act(() => {
      (handlers.keyboardWillChangeFrame ?? handlers.keyboardDidShow)?.({ endCoordinates: { height, screenY: HEIGHT - height } });
    });
  return { showKeyboard };
}
const style = (r: ReturnType<typeof render>, id: string) => StyleSheet.flatten(r.getByTestId(id).props.style);
/** scrollTo is imperative: spy on the form's real ScrollView instance (the first one in the sheet). */
const scrollSpy = (r: ReturnType<typeof render>) =>
  jest.spyOn(r.UNSAFE_getAllByType(ScrollView)[0].instance as unknown as Record<string, () => void>, 'scrollTo').mockImplementation(() => {});
const openSheet = () => render(<PostListingSheet visible initialType="secondhand" lockedType onClose={jest.fn()} />);

beforeEach(() => {
  jest.restoreAllMocks();
  mockLang = 'en';
  setOS('ios');
});
afterAll(() => setOS('ios'));

describe('add-listing popup', () => {
  it('keyboard closed: the original layout (85% card, centred)', () => {
    setup();
    const r = openSheet();
    expect(style(r, 'listing-card').maxHeight).toBe('85%');
    expect(style(r, 'listing-overlay').paddingBottom).toBeUndefined();
  });

  it('keyboard open: the card is lifted above it and capped to the space left (Publish stays on screen)', () => {
    const { showKeyboard } = setup();
    const r = openSheet();
    showKeyboard(291);
    const overlay = style(r, 'listing-overlay');
    expect(overlay.paddingBottom).toBe(291 + 12);
    expect(overlay.paddingTop).toBe(56);
    const maxHeight = style(r, 'listing-card').maxHeight as number;
    expect(maxHeight).toBe(HEIGHT - 291 - 56 - 12);
    expect(r.getByTestId('listing-submit')).toBeTruthy();   // pinned footer is still rendered inside the card
  });

  it('the card never collapses below a usable height', () => {
    const { showKeyboard } = setup();
    const r = openSheet();
    showKeyboard(500);
    expect(style(r, 'listing-card').maxHeight).toBe(240);
  });

  it('the form scrolls: persists taps, closes the keyboard on drag, and adds no inset', () => {
    setup();
    const r = openSheet();
    const scroll = r.getByTestId('listing-scroll');
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(scroll.props.keyboardDismissMode).toBe('interactive');
    expect(scroll.props.automaticallyAdjustKeyboardInsets).toBeUndefined();
  });

  it('Android: on-drag dismiss', () => {
    setOS('android');
    setup();
    expect(openSheet().getByTestId('listing-scroll').props.keyboardDismissMode).toBe('on-drag');
  });

  it('focusing a field scrolls it into view', () => {
    setup();
    const r = openSheet();
    const scrollTo = scrollSpy(r);
    const price = r.getByTestId('input-price');
    // the price row reports where it sits in the form
    fireEvent(price.parent!.parent!, 'layout', { nativeEvent: { layout: { x: 0, y: 640, width: 300, height: 48 } } });
    fireEvent(price, 'focus');
    expect(scrollTo).toHaveBeenCalledWith({ y: 640 - 34, animated: true });
  });

  it('scrolls to the focused field again once the keyboard has finished appearing', () => {
    const { showKeyboard } = setup();
    const r = openSheet();
    const scrollTo = scrollSpy(r);
    const price = r.getByTestId('input-price');
    fireEvent(price.parent!.parent!, 'layout', { nativeEvent: { layout: { x: 0, y: 640, width: 300, height: 48 } } });
    fireEvent(price, 'focus');
    scrollTo.mockClear();
    showKeyboard(291);
    expect(scrollTo).toHaveBeenCalledWith({ y: 606, animated: true });
  });

  it('after the field loses focus, a keyboard change does not scroll', () => {
    const { showKeyboard } = setup();
    const r = openSheet();
    const scrollTo = scrollSpy(r);
    const price = r.getByTestId('input-price');
    fireEvent(price.parent!.parent!, 'layout', { nativeEvent: { layout: { x: 0, y: 640, width: 300, height: 48 } } });
    fireEvent(price, 'focus');
    fireEvent(price, 'blur');
    scrollTo.mockClear();
    showKeyboard(291);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('every text field has the Done bar, and the bar closes the keyboard (the price keypad has no Return key)', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    setup();
    const r = render(<PostListingSheet visible initialType="rental" lockedType onClose={jest.fn()} />);
    const ids = ['input-store-name', 'input-product-url', 'input-price'].map((id) => r.getByTestId(id).props.inputAccessoryViewID);
    expect(ids.every((i) => !!i && i === ids[0])).toBe(true);
    expect(r.getByText(en.builder.keyboard_done)).toBeTruthy();
    fireEvent.press(r.getByTestId('keyboard-done'));
    expect(dismiss).toHaveBeenCalled();
  });

  it('Hebrew: the shared i18n key', () => {
    mockLang = 'he';
    setup();
    expect(openSheet().getByText('סיום')).toBeTruthy();
  });

  it('Android: no Done bar and no accessory id (iOS only)', () => {
    setOS('android');
    setup();
    const r = openSheet();
    expect(r.queryByTestId('keyboard-done')).toBeNull();
    expect(r.getByTestId('input-price').props.inputAccessoryViewID).toBeUndefined();
  });

  it('web: no keyboard listener, no scrolling on focus, layout as it was', () => {
    setOS('web');
    const add = jest.spyOn(Keyboard, 'addListener');
    const r = openSheet();
    const scrollTo = scrollSpy(r);
    fireEvent(r.getByTestId('input-price'), 'focus');
    expect(add).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(r.queryByTestId('keyboard-done')).toBeNull();
    expect(style(r, 'listing-card').maxHeight).toBe('85%');
  });
});

describe('city picker (the Location field)', () => {
  const openCity = () => render(<CityPickerModal visible value="" onSelect={jest.fn()} onClose={jest.fn()} />);

  it('keyboard closed: unchanged (centred card, 280pt list)', () => {
    setup();
    const r = openCity();
    expect(style(r, 'city-list').maxHeight).toBe(280);
    expect(style(r, 'city-overlay').padding).toBe(32);
    expect(style(r, 'city-overlay').paddingBottom).toBeUndefined();
  });

  it('keyboard open: lifted above it, only the list shrinks, the search stays', () => {
    const { showKeyboard } = setup();
    const r = openCity();
    showKeyboard(291);
    expect(style(r, 'city-overlay').paddingBottom).toBe(291 + 12);
    expect(style(r, 'city-overlay').paddingTop).toBe(56);
    expect(style(r, 'city-list').maxHeight).toBeLessThan(280);
    expect(style(r, 'city-list').maxHeight).toBeGreaterThanOrEqual(88);
    expect(r.getByPlaceholderText(en.builder.search_city)).toBeTruthy();
  });

  it('first tap selects, drag closes the keyboard, no inset', () => {
    setup();
    const list = openCity().getByTestId('city-list');
    expect(list.props.keyboardShouldPersistTaps).toBe('handled');
    expect(list.props.keyboardDismissMode).toBe('on-drag');
    expect(list.props.automaticallyAdjustKeyboardInsets).toBeUndefined();
  });

  it('web: no keyboard listener, unchanged', () => {
    setOS('web');
    const add = jest.spyOn(Keyboard, 'addListener');
    const r = openCity();
    expect(add).not.toHaveBeenCalled();
    expect(style(r, 'city-list').maxHeight).toBe(280);
  });
});
