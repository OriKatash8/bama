import { visibleNotices } from '../visibleNotices';
import type { ProjectRequest } from '@core/types/project';

/**
 * "Only sent directly to me" HIDES the rest of the board.
 *
 * It used to be "Sent directly to me — first", which only floated those
 * notices to the top: the whole open board stayed underneath, so a pro with
 * two direct notices still scrolled past fifty public ones to be sure they had
 * seen them. Picking it now means the public notices are not there at all.
 */

const ME = 'pro-1';

function notice(id: string, over: Partial<ProjectRequest> = {}): ProjectRequest {
  return {
    id,
    title: id,
    description: '',
    location: 'Tel Aviv',
    crewSlots: [{ category: 'Video Photographer', quantity: 1 }],
    filledSlots: [],
    createdAt: { seconds: 100, nanoseconds: 0 },
    ...over,
  } as ProjectRequest;
}

const direct = notice('direct', { targetProfessionalId: ME, createdAt: { seconds: 50, nanoseconds: 0 } as never });
const open1 = notice('open-1', { createdAt: { seconds: 300, nanoseconds: 0 } as never });
const open2 = notice('open-2', { createdAt: { seconds: 200, nanoseconds: 0 } as never });
const toSomeoneElse = notice('theirs', { targetProfessionalId: 'pro-2', createdAt: { seconds: 400, nanoseconds: 0 } as never });

const board = [open1, open2, direct, toSomeoneElse];
const ids = (list: ProjectRequest[]) => list.map((r) => r.id);

const opts = { roleFilter: null, search: '', currentUserId: ME };

it('shows only the notices sent to me, not the rest of the board after them', () => {
  const out = visibleNotices(board, { ...opts, sortBy: 'direct_only' });

  expect(ids(out)).toEqual(['direct']);
});

it('does not count a notice aimed at another professional as mine', () => {
  const out = visibleNotices(board, { ...opts, sortBy: 'direct_only' });

  expect(ids(out)).not.toContain('theirs');
});

it('orders what is left newest-first, as the default does', () => {
  const second = notice('direct-2', { targetProfessionalId: ME, createdAt: { seconds: 900, nanoseconds: 0 } as never });
  const out = visibleNotices([...board, second], { ...opts, sortBy: 'direct_only' });

  expect(ids(out)).toEqual(['direct-2', 'direct']);
});

it('leaves the whole board alone on the other two options', () => {
  expect(ids(visibleNotices(board, { ...opts, sortBy: 'newest' })))
    .toEqual(['theirs', 'open-1', 'open-2', 'direct']);
  expect(ids(visibleNotices(board, { ...opts, sortBy: 'oldest' })))
    .toEqual(['direct', 'open-2', 'open-1', 'theirs']);
});

it('still narrows by the search box while showing only mine', () => {
  const other = notice('mine-rooftop', { targetProfessionalId: ME, title: 'Rooftop film', createdAt: { seconds: 700, nanoseconds: 0 } as never });
  const out = visibleNotices([...board, other], { ...opts, search: 'rooftop', sortBy: 'direct_only' });

  expect(ids(out)).toEqual(['mine-rooftop']);
});
