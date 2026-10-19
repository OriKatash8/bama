/**
 * Fitting a centred popup (a Modal is its own window, so the screen's keyboard handling never
 * reaches it) into the space above the on-screen keyboard. Shared by the home location picker,
 * the marketplace city picker and the add-listing form.
 */

/** Room kept above the card for the status bar / notch. */
export const KEYBOARD_TOP_CLEARANCE = 56;
/** Room kept between the card and the keyboard. */
export const KEYBOARD_GAP = 12;

/** Height available to a card with the keyboard up; null when the keyboard is closed. */
export function spaceAboveKeyboard(windowHeight: number, keyboardHeight: number): number | null {
  if (keyboardHeight <= 0) return null;
  return windowHeight - keyboardHeight - KEYBOARD_TOP_CLEARANCE - KEYBOARD_GAP;
}

/** Extra overlay style that lifts a centred card above the keyboard; empty when it is closed. */
export function keyboardOverlayStyle(keyboardHeight: number): { paddingTop?: number; paddingBottom?: number } {
  if (keyboardHeight <= 0) return {};
  return { paddingTop: KEYBOARD_TOP_CLEARANCE, paddingBottom: keyboardHeight + KEYBOARD_GAP };
}
