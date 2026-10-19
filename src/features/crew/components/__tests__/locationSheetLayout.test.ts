import {
  LOCATION_CHROME_HEIGHT, LOCATION_KEYBOARD_GAP, LOCATION_LIST_MAX, LOCATION_LIST_MIN, LOCATION_TOP_CLEARANCE,
  locationSheetLayout,
} from '../locationSheetLayout';

it('no keyboard: the original layout (centred card, 280pt list)', () => {
  expect(locationSheetLayout(852, 0)).toEqual({ listMaxHeight: LOCATION_LIST_MAX, overlay: {} });
  expect(locationSheetLayout(852, -5).overlay).toEqual({});
});

it('keyboard open: the card sits above the keyboard', () => {
  const l = locationSheetLayout(852, 336);
  expect(l.overlay).toEqual({ paddingTop: LOCATION_TOP_CLEARANCE, paddingBottom: 336 + LOCATION_KEYBOARD_GAP });
});

it('a tall phone keeps the full list height', () => {
  expect(locationSheetLayout(932, 336).listMaxHeight).toBe(LOCATION_LIST_MAX);
});

it('a short phone shrinks ONLY the list, and the whole card still fits above the keyboard', () => {
  for (const [h, kb] of [[667, 260], [667, 291], [568, 253]] as const) {
    const l = locationSheetLayout(h, kb);
    const cardHeight = LOCATION_CHROME_HEIGHT + l.listMaxHeight;
    const space = h - kb - LOCATION_TOP_CLEARANCE - LOCATION_KEYBOARD_GAP;
    expect(l.listMaxHeight).toBeLessThan(LOCATION_LIST_MAX);
    expect(l.listMaxHeight).toBeGreaterThanOrEqual(LOCATION_LIST_MIN);
    expect(cardHeight).toBeLessThanOrEqual(space); // header + search + list never leave the screen
  }
});

it('never collapses the list below a few rows, even on a tiny window', () => {
  expect(locationSheetLayout(400, 300).listMaxHeight).toBe(LOCATION_LIST_MIN);
});

it('the list shrinks as the keyboard grows', () => {
  expect(locationSheetLayout(667, 320).listMaxHeight).toBeLessThan(locationSheetLayout(667, 250).listMaxHeight);
});
