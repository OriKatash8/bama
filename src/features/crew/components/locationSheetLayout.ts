/**
 * Sizing for the home screen's location picker (a centred card inside a Modal, so the screen's
 * keyboard handling does not reach it). With the keyboard up, the card is centred in the space
 * ABOVE it and only the results list shrinks: the header and search field never leave the screen.
 */

/** Height of everything in the card except the list: padding, header row, search field. */
export const LOCATION_CHROME_HEIGHT = 108;
/** The list's height with no keyboard (the original maxHeight). */
export const LOCATION_LIST_MAX = 280;
/** A short phone still shows about three results. */
export const LOCATION_LIST_MIN = 88;
/** Room kept above the card for the status bar / notch. */
export const LOCATION_TOP_CLEARANCE = 56;
/** Room kept between the card and the keyboard. */
export const LOCATION_KEYBOARD_GAP = 12;

export type LocationSheetLayout = {
  listMaxHeight: number;
  /** Extra overlay style while the keyboard is open; empty otherwise (the card stays centred on the screen). */
  overlay: { paddingTop?: number; paddingBottom?: number };
};

export function locationSheetLayout(windowHeight: number, keyboardHeight: number): LocationSheetLayout {
  if (keyboardHeight <= 0) return { listMaxHeight: LOCATION_LIST_MAX, overlay: {} };
  const space = windowHeight - keyboardHeight - LOCATION_TOP_CLEARANCE - LOCATION_KEYBOARD_GAP;
  const listMaxHeight = Math.min(LOCATION_LIST_MAX, Math.max(LOCATION_LIST_MIN, space - LOCATION_CHROME_HEIGHT));
  return {
    listMaxHeight,
    overlay: { paddingTop: LOCATION_TOP_CLEARANCE, paddingBottom: keyboardHeight + LOCATION_KEYBOARD_GAP },
  };
}
