import { addDoc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { channelDocToMessage, listenToMessages, sendMessage } from '../chatService';
import type { Message } from '../../types';

/**
 * Exactly what `sendMessage` puts on a message document.
 *
 * This is the payload the hardened create rule now validates, so the shape is
 * no longer a private detail of the service — a field that should not be there
 * is a write that gets rejected at the server, on the hot path of every chat.
 */

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db, ...path: string[]) => ({ path: path.join('/') })),
  doc: jest.fn((_db, ...path: string[]) => ({ path: path.join('/') })),
  addDoc: jest.fn(),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
  serverTimestamp: jest.fn(() => '__ts__'),
  increment: jest.fn((n: number) => ({ __increment: n })),
  onSnapshot: jest.fn(),
  query: jest.fn(),
  orderBy: jest.fn(),
  where: jest.fn(),
  arrayUnion: jest.fn(),
  arrayRemove: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  deleteDoc: jest.fn(),
  limit: jest.fn(),
  writeBatch: jest.fn(),
}));
jest.mock('../../../../core/firebase/config', () => ({ db: {} }));

const mockAddDoc = addDoc as jest.Mock;
const mockGetDoc = getDoc as jest.Mock;

/** The message payload from the most recent send. */
const sent = () => mockAddDoc.mock.calls[0][1] as Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ members: ['me', 'you'] }) });
  (updateDoc as jest.Mock).mockResolvedValue(undefined);
  mockAddDoc.mockResolvedValue({ id: 'm1' });
});

it('writes the four fields every message has, and nothing else', async () => {
  await sendMessage('c1', 'me', 'hello');
  expect(Object.keys(sent()).sort()).toEqual(['readBy', 'senderId', 'text', 'timestamp']);
  expect(sent().senderId).toBe('me');
});

it('carries mentions when the composer supplies them', async () => {
  await sendMessage('c1', 'me', 'hey @You', { mentions: ['you'] });
  expect(sent().mentions).toEqual(['you']);
  // The readable token stays in the text — the push body and the chat-list
  // preview read it verbatim and need no knowledge of mentions at all.
  expect(sent().text).toBe('hey @You');
});

it('omits the field entirely rather than writing an empty list', async () => {
  // Every message in the app goes through here. Writing `mentions: []` on all
  // of them would be bytes and noise on documents that mention nobody.
  await sendMessage('c1', 'me', 'hello', { mentions: [] });
  expect('mentions' in sent()).toBe(false);
});

it('never lets a client set `system`', async () => {
  // The create rule denies the key outright, so a caller that could still pass
  // it would fail at the server on send. The option is gone from the signature;
  // this is the runtime half of that guarantee.
  await sendMessage('c1', 'me', 'hello', { mentions: ['you'] });
  expect('system' in sent()).toBe(false);
});

it('still writes media alongside a mention', async () => {
  await sendMessage('c1', 'me', 'look @You', { imageURL: 'https://x/y.jpg', mentions: ['you'] });
  expect(sent().imageURL).toBe('https://x/y.jpg');
  expect(sent().mentions).toEqual(['you']);
});

/**
 * `replyTo` — the denormalized quote, written only when there is one.
 *
 * The first test in this file asserts the exact key set of an ordinary send, so
 * an unconditional `replyTo: undefined` would break it. That test is the anchor
 * for everything here: it is what stops the field leaking onto the overwhelming
 * majority of messages, which quote nothing.
 */
describe('replyTo on the way out', () => {
  const quote = { messageId: 'm0', senderId: 'you', kind: 'text' as const, snippet: 'the original' };

  it('writes the quote when the composer has one', async () => {
    await sendMessage('c1', 'me', 'on it', { replyTo: quote });
    expect(sent().replyTo).toEqual(quote);
  });

  it('omits the key entirely on an ordinary send', async () => {
    await sendMessage('c1', 'me', 'hello');
    expect('replyTo' in sent()).toBe(false);
  });

  it('writes all four keys and nothing else — the rule uses hasOnly', async () => {
    await sendMessage('c1', 'me', 'on it', { replyTo: quote });
    expect(Object.keys(sent().replyTo as object).sort())
      .toEqual(['kind', 'messageId', 'senderId', 'snippet']);
  });

  it('carries a quote and a mention on the same message', async () => {
    await sendMessage('c1', 'me', 'hey @You', { mentions: ['you'], replyTo: quote });
    expect(sent().replyTo).toEqual(quote);
    expect(sent().mentions).toEqual(['you']);
  });

  it('leaves the reply text alone — the quote is separate from what was typed', async () => {
    await sendMessage('c1', 'me', 'on it', { replyTo: quote });
    expect(sent().text).toBe('on it');
  });
});

/**
 * The READ side of the same field.
 *
 * `docToMessage` is an explicit whitelist, so a field that is written but not
 * listed there is dropped in silence — the document is right, the bubble
 * renders nothing, and nothing anywhere says why. Mutation testing caught this
 * exact gap: deleting `mentions` from the mapper failed not one of the 1225
 * tests until this existed.
 */
describe('reading a message back', () => {
  /** Drive listenToMessages' snapshot handler with raw document data. */
  function read(raw: Record<string, unknown>): Message {
    let out: Message[] = [];
    (onSnapshot as jest.Mock).mockImplementation((_q, onNext: (s: unknown) => void) => {
      onNext({ docs: [{ id: 'm1', data: () => raw }] });
      return () => {};
    });
    listenToMessages('c1', (msgs) => { out = msgs; });
    return out[0];
  }

  it('carries mentions through to the Message', () => {
    expect(read({ senderId: 'me', text: 'hey @You', mentions: ['you'] }).mentions).toEqual(['you']);
  });

  it('carries mentionsEveryone through', () => {
    expect(read({ senderId: 'me', text: '@everyone', mentionsEveryone: true }).mentionsEveryone).toBe(true);
  });

  it('leaves both undefined on an ordinary message', () => {
    const m = read({ senderId: 'me', text: 'hello' });
    expect(m.mentions).toBeUndefined();
    expect(m.mentionsEveryone).toBeUndefined();
  });

  it('carries replyTo through to the Message', () => {
    const quote = { messageId: 'm0', senderId: 'you', kind: 'text', snippet: 'the original' };
    expect(read({ senderId: 'me', text: 'on it', replyTo: quote }).replyTo).toEqual(quote);
  });

  it('leaves replyTo undefined on a message that quotes nothing', () => {
    expect(read({ senderId: 'me', text: 'hello' }).replyTo).toBeUndefined();
  });

  it('still maps everything it mapped before', () => {
    // The anchor: the additions must not have displaced an existing field.
    const m = read({
      senderId: 'me', text: 'cap', imageURL: 'i', videoUrl: 'v',
      audioUrl: 'a', audioDuration: 3, readBy: ['me'], system: true,
    });
    expect(m).toMatchObject({
      id: 'm1', senderId: 'me', text: 'cap', imageURL: 'i', videoUrl: 'v',
      audioUrl: 'a', audioDuration: 3, readBy: ['me'], system: true,
    });
  });
});

/**
 * The channel read path, which is a SECOND whitelist over a different shape.
 *
 * It used to live inline in ChatRoomScreen, where a field added to one mapper
 * and forgotten in the other was invisible — `satisfies Message` does not
 * complain about an omitted optional, so nothing caught it until a bubble
 * rendered wrong.
 */
describe('reading a channel message back', () => {
  it('carries mentions and mentionsEveryone', () => {
    const m = channelDocToMessage('m9', {
      senderId: 'me', text: '@כולם יש עדכון', mentions: ['you'], mentionsEveryone: true,
    });
    expect(m.mentions).toEqual(['you']);
    expect(m.mentionsEveryone).toBe(true);
  });

  it('leaves both undefined on an ordinary channel message', () => {
    const m = channelDocToMessage('m9', { senderId: 'me', text: 'hello' });
    expect(m.mentions).toBeUndefined();
    expect(m.mentionsEveryone).toBeUndefined();
  });

  it('carries replyTo, which this mapper needs just as much', () => {
    // The gap this whole describe block exists for: a field added to one mapper
    // and forgotten in the other renders a bubble wrong with nothing to say why.
    const quote = { messageId: 'm0', senderId: 'you', kind: 'image', snippet: '' };
    expect(channelDocToMessage('m9', { senderId: 'me', text: 'nice', replyTo: quote }).replyTo)
      .toEqual(quote);
  });

  it('leaves replyTo undefined on an ordinary channel message', () => {
    expect(channelDocToMessage('m9', { senderId: 'me', text: 'hello' }).replyTo).toBeUndefined();
  });

  it('still maps the shared-listing payload, which only this collection has', () => {
    const m = channelDocToMessage('m9', {
      senderId: 'me', text: 'Tripod · ₪200', readBy: ['me'],
      type: 'listing', listingId: 'l1', title: 'Tripod', price: 200,
      imageUrl: null, posterId: 'me', posterName: 'Me',
    });
    expect(m).toMatchObject({
      id: 'm9', type: 'listing', listingId: 'l1', title: 'Tripod',
      price: 200, imageUrl: null, posterId: 'me', posterName: 'Me',
    });
  });

  it('defaults text and readBy rather than yielding undefined', () => {
    const m = channelDocToMessage('m9', { senderId: 'me' });
    expect(m.text).toBe('');
    expect(m.readBy).toEqual([]);
  });
});
