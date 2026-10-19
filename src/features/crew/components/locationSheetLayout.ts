import { KEYBOARD_GAP, KEYBOARD_TOP_CLEARANCE, keyboardOverlayStyle, spaceAboveKeyboard } from '@core/layout/keyboardSpace';

/**
 * Sizing for a location picker (a centred card with a search field and a results list). With the
 * keyboard up, the card is centred in the space ABOVE it and only the list shrinks: the header and
 * search field never leave the screen. Used by the home screen and the marketplace city picker.
 */

/** Height of everything in the card except the list: padding, header row, search field. */
export const LOCATION_CHROME_HEIGHT = 108;
/** The list's height with no keyboard (the original maxHeight). */
export const LOCATION_LIST_MAX = 280;
/** A short phone still shows about three results. */
export const LOCATION_LIST_MIN = 88;
export const LOCATION_TOP_CLEARANCE = KEYBOARD_TOP_CLEARANCE;
export const LOCATION_KEYBOARD_GAP = KEYBOARD_GAP;

export type LocationSheetLayout = {
  listMaxHeight: number;
  /** Extra overlay style while the keyboard is open; empty otherwise (the card stays centred on the screen). */
  overlay: { paddingTop?: number; paddingBottom?: number };
};

export function locationSheetLayout(windowHeight: number, keyboardHeight: number): LocationSheetLayout {
  const space = spaceAboveKeyboard(windowHeight, keyboardHeight);
  if (space == null) return { listMaxHeight: LOCATION_LIST_MAX, overlay: {} };
  return {
    listMaxHeight: Math.min(LOCATION_LIST_MAX, Math.max(LOCATION_LIST_MIN, space - LOCATION_CHROME_HEIGHT)),
    overlay: keyboardOverlayStyle(keyboardHeight),
  };
}
