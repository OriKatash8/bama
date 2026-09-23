import { recipientsFor } from '../recipients';

/**
 * Who gets notified about a message, and as what.
 *
 * Extracted from the two triggers so the one rule that actually matters — a
 * mention reaches you even when you have muted the chat — is testable without
 * standing up an emulator. The triggers stay thin wrappers around this.
 */

const ALICE = 'u-alice';
const BOB = 'u-bob';
const CARA = 'u-cara';
const MEMBERS = [ALICE, BOB, CARA];

const call = (over: Partial<Parameters<typeof recipientsFor>[0]> = {}) =>
  recipientsFor({ members: MEMBERS, senderId: ALICE, mutedBy: [], ...over });

/** Sorted `userId:kind` pairs, so assertions do not depend on iteration order. */
const shape = (rows: ReturnType<typeof recipientsFor>) =>
  rows.map((r) => `${r.userId}:${r.kind}`).sort();

describe('an ordinary message', () => {
  it('goes to every member but the sender', () => {
    expect(shape(call())).toEqual([`${BOB}:message`, `${CARA}:message`]);
  });

  it('skips anyone who muted the chat', () => {
    expect(shape(call({ mutedBy: [BOB] }))).toEqual([`${CARA}:message`]);
  });

  it('reaches nobody when the sender is the only member', () => {
    expect(call({ members: [ALICE] })).toEqual([]);
  });
});

describe('a mention', () => {
  it('is marked as a mention, and the rest still get an ordinary message', () => {
    expect(shape(call({ mentions: [BOB] }))).toEqual([`${BOB}:mention`, `${CARA}:message`]);
  });

  it('REACHES A MUTED USER — this is the whole point of @', () => {
    // Bob muted the chat and is mentioned anyway; Cara did not mute and is not
    // mentioned, so she is unaffected.
    expect(shape(call({ mentions: [BOB], mutedBy: [BOB] })))
      .toEqual([`${BOB}:mention`, `${CARA}:message`]);
    // Now Cara has muted too and was still not mentioned, so she stays silent.
    expect(shape(call({ mentions: [BOB], mutedBy: [BOB, CARA] }))).toEqual([`${BOB}:mention`]);
  });

  it('never notifies the sender, even if they mention themselves', () => {
    expect(shape(call({ mentions: [ALICE, BOB] }))).toEqual([`${BOB}:mention`, `${CARA}:message`]);
  });

  it('ignores an id that is not a member', () => {
    // The rules already deny this on write; belt and braces, because this
    // function decides who gets pushed and a stale document could carry one.
    expect(shape(call({ mentions: ['u-stranger'] })))
      .toEqual([`${BOB}:message`, `${CARA}:message`]);
  });

  it('notifies each mentioned member exactly once when named twice', () => {
    expect(shape(call({ mentions: [BOB, BOB] }))).toEqual([`${BOB}:mention`, `${CARA}:message`]);
  });
});

describe('@everyone', () => {
  it('makes every other member a mention', () => {
    expect(shape(call({ mentionsEveryone: true })))
      .toEqual([`${BOB}:mention`, `${CARA}:mention`]);
  });

  it('overrides mute for everyone — which is why it is the owner’s alone', () => {
    expect(shape(call({ mentionsEveryone: true, mutedBy: [BOB, CARA] })))
      .toEqual([`${BOB}:mention`, `${CARA}:mention`]);
  });

  it('still does not notify the sender', () => {
    expect(shape(call({ mentionsEveryone: true })).filter((r) => r.startsWith(ALICE))).toEqual([]);
  });
});
