import { isReceiptChat, receiptStatus, toMillis } from '../readReceipts';

const ts = (ms: number) => ({ toMillis: () => ms });
const ME = 'me';

describe('isReceiptChat', () => {
  it.each([['group', true], ['purchase', true], ['dm', false], ['community', false], [null, false], [undefined, false]])(
    '%s → %s', (type, expected) => {
      expect(isReceiptChat(type as never)).toBe(expected);
    },
  );
});

describe('toMillis', () => {
  it('reads a timestamp, and is null while the server has not stamped it', () => {
    expect(toMillis(ts(5))).toBe(5);
    expect(toMillis(null)).toBeNull();
    expect(toMillis(undefined)).toBeNull();
  });
});

describe('receiptStatus', () => {
  it('is "sending" while the timestamp is still pending', () => {
    const r = receiptStatus(null, ME, [ME, 'a', 'b'], {});
    expect(r.status).toBe('sending');
    expect(r.notSeen).toEqual(['a', 'b']);
  });

  it('is "sent" when nobody has read it', () => {
    const r = receiptStatus(ts(100), ME, [ME, 'a', 'b'], {});
    expect(r).toEqual({ status: 'sent', seenBy: [], notSeen: ['a', 'b'] });
  });

  it('stays "sent" with one of two readers, and lists who saw it', () => {
    const r = receiptStatus(ts(100), ME, [ME, 'a', 'b'], { a: 100 });
    expect(r).toEqual({ status: 'sent', seenBy: ['a'], notSeen: ['b'] });
  });

  it('is "seen" once every other member has caught up (at or past the message)', () => {
    const r = receiptStatus(ts(100), ME, [ME, 'a', 'b'], { a: 100, b: 250 });
    expect(r.status).toBe('seen');
    expect(r.seenBy).toEqual(['a', 'b']);
    expect(r.notSeen).toEqual([]);
  });

  it('a watermark just before the message does not count', () => {
    expect(receiptStatus(ts(100), ME, [ME, 'a'], { a: 99 }).status).toBe('sent');
  });

  it("ignores the sender's own watermark", () => {
    expect(receiptStatus(ts(100), ME, [ME, 'a'], { [ME]: 999 }).status).toBe('sent');
  });

  it('a member who left (not in members) no longer blocks "seen"', () => {
    expect(receiptStatus(ts(100), ME, [ME, 'a'], { a: 100, gone: 0 }).status).toBe('seen');
  });

  it('a member who joined later holds it back until they open the chat', () => {
    const before = receiptStatus(ts(100), ME, [ME, 'a', 'late'], { a: 200 });
    expect(before.status).toBe('sent');
    const after = receiptStatus(ts(100), ME, [ME, 'a', 'late'], { a: 200, late: 500 });
    expect(after.status).toBe('seen');
  });

  it('a chat with nobody else can never be "seen"', () => {
    expect(receiptStatus(ts(100), ME, [ME], {}).status).toBe('sent');
  });
});
