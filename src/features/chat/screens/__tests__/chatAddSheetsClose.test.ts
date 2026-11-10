import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The chat's "+" → Add mission / Add meeting sheets. Real touches and Modals can't be
 * rendered in jest, so this pins the structure that keeps them from leaving anything on
 * top of the chat: one Modal per sheet (the calendar is the sheet's own overlay) and ONE
 * close path that resets the picker and takes the keyboard down.
 */
const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');

it('no calendar is mounted as a sibling Modal after the sheets', () => {
  expect(SRC).not.toMatch(/\{showDueDatePicker && \(\s*<MiniCalendar/);
  expect(SRC).not.toMatch(/\{showMeetingDatePicker && \(\s*<MiniCalendar/);
});

it.each([
  ['mission', 'showAddMission', 'showDueDatePicker', 'closeAddMission', 'setShowDueDatePicker', 'setShowAddMission'],
  ['meeting', 'showAddMeeting', 'showMeetingDatePicker', 'closeAddMeeting', 'setShowMeetingDatePicker', 'setShowAddMeeting'],
])('%s: the calendar is the sheet\'s own inline overlay, Back dismisses it first', (_n, shown, picker, close, setPicker) => {
  const re = new RegExp(
    `visible=\\{${shown}\\}\\s+onClose=\\{${close}\\}\\s+onOverlayBack=\\{\\(\\) => [^\\n]*${setPicker}\\(false\\)[^\\n]*\\}\\s+overlay=\\{${shown} && ${picker} \\? \\(\\s+<MiniCalendar\\s+inline`,
  );
  expect(SRC).toMatch(re);
});

it.each([
  ['closeAddMission', 'setShowDueDatePicker', 'setShowAddMission'],
  ['closeAddMeeting', 'setShowMeetingDatePicker', 'setShowAddMeeting'],
])('%s dismisses the keyboard, resets the picker, then hides the sheet', (fn, setPicker, setShown) => {
  const start = SRC.indexOf(`const ${fn} = useCallback(() => {`);
  expect(start).toBeGreaterThan(-1);
  const body = SRC.slice(start, SRC.indexOf('}, []);', start));
  const order = ['Keyboard.dismiss()', `${setPicker}(false)`, `${setShown}(false)`].map((s) => body.indexOf(s));
  expect(order.every((i) => i > -1)).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));
});

it('meeting: the time is the project-details hour picker, inline in the sheet\'s own Modal', () => {
  expect(SRC).toMatch(/import \{ MiniCalendar, MiniTimePicker \} from '@features\/crew\/components'/);
  expect(SRC).toMatch(/<MiniTimePicker\s+inline\s+value=\{newMeetingTime\}\s+onSelect=\{\(time\) => setNewMeetingTime\(time\)\}\s+onClose=\{\(\) => setShowMeetingTimePicker\(false\)\}/);
  // the free-text field is gone
  expect(SRC).not.toMatch(/onChangeText=\{setNewMeetingTime\}/);
});

it('closeAddMeeting resets the time picker too, and Back dismisses either overlay', () => {
  const start = SRC.indexOf('const closeAddMeeting = useCallback(() => {');
  const body = SRC.slice(start, SRC.indexOf('}, []);', start));
  expect(body).toMatch(/setShowMeetingTimePicker\(false\)/);
  expect(SRC).toMatch(/onOverlayBack=\{\(\) => \{ setShowMeetingDatePicker\(false\); setShowMeetingTimePicker\(false\); \}\}/);
});

it('opening a picker takes the keyboard down first', () => {
  expect(SRC).toMatch(/Keyboard\.dismiss\(\); setShowMeetingTimePicker\(true\)/);
  expect(SRC).toMatch(/Keyboard\.dismiss\(\); setShowMeetingDatePicker\(true\)/);
  expect(SRC).toMatch(/Keyboard\.dismiss\(\); setShowDueDatePicker\(true\)/);
});

it('every close path goes through it: backdrop (onClose), the dismiss button and a successful add', () => {
  expect(SRC).toMatch(/onPress=\{closeAddMission\} activeOpacity/);
  expect(SRC).toMatch(/onPress=\{closeAddMeeting\} activeOpacity/);
  expect(SRC).toMatch(/closeAddMission\(\);\s+\} catch \(e: unknown\)/);
  expect(SRC).toMatch(/closeAddMeeting\(\);\s+\} catch \{/);
  // nothing closes a sheet directly any more
  expect(SRC).not.toMatch(/onClose=\{\(\) => setShowAdd(Mission|Meeting)\(false\)\}/);
});

it('keeps the Phase A list props and the read-receipt wiring', () => {
  expect(SRC).toMatch(/keyboardShouldPersistTaps="handled"\n\s+\/\/ Drag the list down/);
  expect(SRC).toMatch(/keyboardDismissMode=\{Platform\.OS === 'ios' \? 'interactive' : 'on-drag'\}/);
  expect(SRC).toMatch(/const receiptsOn = isReceiptChat\(chatType\)/);
});
