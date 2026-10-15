/**
 * onProjectCreate tells every matching professional about a new open project.
 * An admin account is admin-only: it is skipped even when its profile would
 * match (ADMIN_UIDS, the same list onReportCreate alerts).
 */
let mockAdminUids: string[] = [];
const mockAdded: { userId: string }[] = [];
const mockProfiles: Record<string, unknown> = {};

jest.mock('firebase-functions/params', () => ({ defineList: () => ({ value: () => mockAdminUids }) }));
// v1 triggers: .run is the handler itself (the real SDK cannot load under jest).
jest.mock('firebase-functions', () => {
  const wrap = (h: unknown) => ({ run: h });
  const doc = () => ({ onCreate: wrap, onUpdate: wrap, onWrite: wrap, onDelete: wrap });
  return { firestore: { document: doc }, pubsub: { schedule: () => ({ onRun: wrap }) } };
});
jest.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'TS' } }));
jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  firestore: () => ({
    collection: (name: string) => {
      if (name === 'notifications') return { add: async (d: { userId: string }) => { mockAdded.push(d); } };
      return {
        get: async () => ({ docs: Object.keys(mockProfiles).map((id) => ({ id, data: () => ({}) })) }),
        doc: (uid: string) => ({
          collection: () => ({ doc: () => ({ get: async () => ({ exists: uid in mockProfiles, data: () => mockProfiles[uid] }) }) }),
        }),
      };
    },
  }),
}));
jest.mock('../../lifecycle/helpers', () => ({ FieldValue: { serverTimestamp: () => 'TS' }, db: {} }));
jest.mock('../../system', () => ({ SYSTEM_USER_ID: 'bama-system' }));
jest.mock('../../communities/memberStats', () => ({ bumpMemberStats: jest.fn() }));
jest.mock('../../demo', () => ({ readDemoConfig: async () => ({}), sameSide: () => true }));

import { onProjectCreate } from '../triggers';

const PRO = { roleSkills: [{ role: 'videographer', specializations: ['general'] }] };
const fire = () =>
  (onProjectCreate as unknown as { run: (s: unknown, c: unknown) => Promise<void> }).run(
    {
      data: () => ({
        status: 'open', clientId: 'client1', title: 'Shoot',
        crewSlots: [{ category: 'Video Photographer', quantity: 1 }], filledSlots: [],
      }),
    },
    { params: { projectId: 'p1' } },
  );

beforeEach(() => {
  mockAdded.length = 0;
  for (const k of Object.keys(mockProfiles)) delete mockProfiles[k];
  Object.assign(mockProfiles, { client1: PRO, pro1: PRO, admin1: PRO });
  mockAdminUids = ['admin1'];
});

describe('onProjectCreate', () => {
  it('notifies a matching professional but not an admin whose profile also matches', async () => {
    await fire();
    expect(mockAdded.map((n) => n.userId)).toEqual(['pro1']);
  });

  it('with no admins configured it still notifies every match except the client', async () => {
    mockAdminUids = [];
    await fire();
    expect(mockAdded.map((n) => n.userId).sort()).toEqual(['admin1', 'pro1']);
  });
});
