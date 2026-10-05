import { act, renderHook } from '@testing-library/react-native';
import { usePeople } from '../hooks';

const mockDocs: Record<string, Record<string, unknown> | undefined> = {};
const mockGetDoc = jest.fn(async (path: string) => ({ data: () => mockDocs[path], exists: () => mockDocs[path] !== undefined }));
jest.mock('@core/firebase/config', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  getDoc: (path: string) => mockGetDoc(path),
  collection: jest.fn(), query: jest.fn(), where: jest.fn(), orderBy: jest.fn(), onSnapshot: jest.fn(() => () => {}),
  Timestamp: class {},
}));

beforeEach(() => { jest.clearAllMocks(); for (const k of Object.keys(mockDocs)) delete mockDocs[k]; });

async function load(uids: string[]) {
  const r = renderHook(() => usePeople(uids));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return r.result.current;
}

describe('usePeople: the professional-profile facts the owner sees on a request', () => {
  it('a person with a name and roles has a usable pro profile, with every role', async () => {
    mockDocs['users/a'] = { displayName: 'Noa', photoURL: null };
    mockDocs['users/a/profile/data'] = { roleSkills: [{ role: 'editor' }, { role: 'videographer' }] };
    const p = (await load(['a'])).a;
    expect(p).toMatchObject({ name: 'Noa', roleId: 'editor', roleIds: ['editor', 'videographer'], hasUsableProProfile: true });
  });

  it('no profile document: not usable, no roles', async () => {
    mockDocs['users/b'] = { displayName: 'Itay' };
    const p = (await load(['b'])).b;
    expect(p).toMatchObject({ name: 'Itay', roleId: null, roleIds: [], hasUsableProProfile: false });
  });

  it('roles but a blank name: not usable', async () => {
    mockDocs['users/c'] = { displayName: '  ' };
    mockDocs['users/c/profile/data'] = { roleSkills: [{ role: 'editor' }] };
    expect((await load(['c'])).c.hasUsableProProfile).toBe(false);
  });

  it('decides from name and roles, never from the stored proProfileCompleted flag', async () => {
    mockDocs['users/d'] = { displayName: 'Dan' };
    mockDocs['users/d/profile/data'] = { roleSkills: [{ role: 'editor' }], proProfileCompleted: false };
    mockDocs['users/e'] = { displayName: 'Eli' };
    mockDocs['users/e/profile/data'] = { roleSkills: [], proProfileCompleted: true };
    const people = await load(['d', 'e']);
    expect(people.d.hasUsableProProfile).toBe(true);
    expect(people.e.hasUsableProProfile).toBe(false);
  });

  it('drops malformed role entries instead of crashing', async () => {
    mockDocs['users/f'] = { displayName: 'Fay' };
    mockDocs['users/f/profile/data'] = { roleSkills: [null, {}, { role: '' }, { role: 'editor' }] };
    expect((await load(['f'])).f.roleIds).toEqual(['editor']);
  });

  it('costs no more than the two reads per person it always did', async () => {
    mockDocs['users/a'] = { displayName: 'Noa' };
    await load(['a']);
    expect(mockGetDoc).toHaveBeenCalledTimes(2);
    expect(mockGetDoc.mock.calls.map((c) => c[0]).sort()).toEqual(['users/a', 'users/a/profile/data']);
  });
});
