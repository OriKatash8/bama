import { syncUser } from '../syncUser';
import { getDocument, setDocument, updateDocument } from '@core/firebase/firestore';

/** A new social account is flagged for first-time setup, whether or not
 *  onUserCreate already wrote its users doc (the two race). */
jest.mock('@core/firebase/firestore', () => ({
  getDocument: jest.fn(),
  setDocument: jest.fn(async () => undefined),
  updateDocument: jest.fn(async () => undefined),
}));

const info = { email: 'a@b.c', displayName: 'Noa', photoURL: null };
beforeEach(() => jest.clearAllMocks());

it('no doc yet: created with the flag', async () => {
  (getDocument as jest.Mock).mockResolvedValue(null);
  const setUser = jest.fn();
  await syncUser('u1', info, setUser, undefined, { newAccount: true });
  expect(setDocument).toHaveBeenCalledWith('users/u1', expect.objectContaining({ needsProfileSetup: true }));
  expect(setUser.mock.calls[0][0].needsProfileSetup).toBe(true);
});

it('doc already written by the server: the flag is added to it', async () => {
  (getDocument as jest.Mock).mockResolvedValue({ id: 'u1', displayName: 'Noa', photoURL: null });
  const setUser = jest.fn();
  await syncUser('u1', info, setUser, undefined, { newAccount: true });
  expect(updateDocument).toHaveBeenCalledWith('users/u1', expect.objectContaining({ needsProfileSetup: true }));
  expect(setUser.mock.calls[0][0].needsProfileSetup).toBe(true);
});

it('an existing account signing in is never flagged', async () => {
  (getDocument as jest.Mock).mockResolvedValue({ id: 'u1', displayName: 'Noa', photoURL: null });
  const setUser = jest.fn();
  await syncUser('u1', info, setUser);
  expect(updateDocument).not.toHaveBeenCalled();
  expect(setUser.mock.calls[0][0].needsProfileSetup).toBeUndefined();
});
