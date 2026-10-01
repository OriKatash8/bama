import { filterProjects, type AdminProjectRow } from '../filterProjects';

/** The admin projects search: title or client name, any case, as you type. */

const rows: AdminProjectRow[] = [
  { id: 'p1', title: 'Wedding shoot', clientName: 'Noa Levi', status: 'open', createdAt: 3, chatId: 'c1' },
  { id: 'p2', title: 'Promo video', clientName: 'Avi Cohen', status: 'completed', createdAt: 2, chatId: 'c2' },
  { id: 'p3', title: 'צילומי חתונה', clientName: 'דנה', status: 'in_progress', createdAt: 1, chatId: null },
];

it('an empty search shows every project, newest first', () => {
  expect(filterProjects(rows, '  ').map((r) => r.id)).toEqual(['p1', 'p2', 'p3']);
  expect(filterProjects([...rows].reverse(), '').map((r) => r.id)).toEqual(['p1', 'p2', 'p3']);
});

it('matches the title, any case', () => {
  expect(filterProjects(rows, 'WEDDING').map((r) => r.id)).toEqual(['p1']);
});

it('matches the client name', () => {
  expect(filterProjects(rows, 'cohen').map((r) => r.id)).toEqual(['p2']);
});

it('works in Hebrew', () => {
  expect(filterProjects(rows, 'חתונה').map((r) => r.id)).toEqual(['p3']);
  expect(filterProjects(rows, 'דנה').map((r) => r.id)).toEqual(['p3']);
});

it('no match is an empty list', () => {
  expect(filterProjects(rows, 'zzz')).toEqual([]);
});
