import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reviewableProIds } from '../reviewTargets';

it('offers each pro once, and only pros still on the project', () => {
  const slots = [{ professionalId: 'a' }, { professionalId: 'a' }, { professionalId: 'b' }, { professionalId: 'gone' }];
  expect(reviewableProIds(slots, ['a', 'b'])).toEqual(['a', 'b']);
});

it('a legacy project with no professionalIds keeps everyone in filledSlots', () => {
  expect(reviewableProIds([{ professionalId: 'a' }, { professionalId: 'b' }], undefined)).toEqual(['a', 'b']);
});

it('nothing filled, nothing to review', () => {
  expect(reviewableProIds(undefined, ['a'])).toEqual([]);
});

/** Wiring: both review entry points use it, and ReviewFlow writes through submitReviews. */
const ROOT = join(__dirname, '..', '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
it('ReviewFlowGate and project-details offer only reviewable pros; ReviewFlow submits through submitReviews', () => {
  expect(read('src/features/reviews/components/ReviewFlowGate.tsx')).toMatch(/reviewableProIds\(filledSlots, project\.professionalIds\)/);
  const pd = read('src/app/(client)/chat/project-details.tsx');
  expect(pd).toMatch(/const fresh = \(await getDocument<ProjectRequest>\(`projects\/\$\{projectId\}`\)\) \?\? project;/);
  expect(pd).toMatch(/reviewableProIds\(fresh\.filledSlots, fresh\.professionalIds\)/);
  expect(pd).toMatch(/filledSlots\.filter\(\(s\) => reviewableIds\.includes\(s\.professionalId\)\)/);
  const rf = read('src/features/reviews/components/ReviewFlow.tsx');
  expect(rf).toMatch(/await submitReviews\(\{/);
  expect(rf).not.toMatch(/Promise\.all\(/);
});
