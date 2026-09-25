import { bumpMemberStats } from '../memberStats';

const set = jest.fn().mockResolvedValue(undefined);
const paths: string[] = [];
const node = (path: string): any => ({
  collection: (c: string) => node(`${path}/${c}`),
  doc: (d: string) => { paths.push(`${path}/${d}`); return { ...node(`${path}/${d}`), set }; },
});
const db = { collection: (c: string) => node(c) } as unknown as Parameters<typeof bumpMemberStats>[0];

beforeEach(() => { set.mockClear(); paths.length = 0; });

it('merges an increment into chats/{chatId}/memberStats/{senderId}', async () => {
  await bumpMemberStats(db, 'c1', 'u1');
  expect(paths).toContain('chats/c1/memberStats/u1');
  const [data, opts] = set.mock.calls[0];
  expect(Object.keys(data).sort()).toEqual(['lastMessageAt', 'messageCount']);
  expect(opts).toEqual({ merge: true });
});

it('swallows a failed write so notifications still go out', async () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  set.mockRejectedValueOnce(new Error('boom'));
  await expect(bumpMemberStats(db, 'c1', 'u1')).resolves.toBeUndefined();
  spy.mockRestore();
});
