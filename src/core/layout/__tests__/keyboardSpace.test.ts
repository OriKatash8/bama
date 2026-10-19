import { KEYBOARD_GAP, KEYBOARD_TOP_CLEARANCE, keyboardOverlayStyle, spaceAboveKeyboard } from '../keyboardSpace';

it('keyboard closed: nothing to do', () => {
  expect(spaceAboveKeyboard(852, 0)).toBeNull();
  expect(spaceAboveKeyboard(852, -3)).toBeNull();
  expect(keyboardOverlayStyle(0)).toEqual({});
});

it('keyboard open: the space left above it, and the lifting padding', () => {
  expect(spaceAboveKeyboard(852, 336)).toBe(852 - 336 - KEYBOARD_TOP_CLEARANCE - KEYBOARD_GAP);
  expect(keyboardOverlayStyle(336)).toEqual({ paddingTop: KEYBOARD_TOP_CLEARANCE, paddingBottom: 336 + KEYBOARD_GAP });
});
