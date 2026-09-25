import { mergeCrewSlots, getVacantSlots } from '../matching';

/**
 * ADDING A PROFESSIONAL TO A PROJECT RAISES THE QUANTITY; IT DOES NOT APPEND.
 *
 * project-details used to write `arrayUnion(...newSlots)`. arrayUnion drops an
 * element equal to one already stored, so adding a second "camera ×1" to a
 * project that had "camera ×1" wrote nothing — the screen showed it, the board
 * never did. And a duplicate entry would not have helped anyway: getVacantSlots
 * subtracts every same-kind fill from EACH entry, so [cam×1, cam×1] with one
 * camera hired reads as zero vacancies.
 */

const CAM = 'Video Photographer';

it('adds to the quantity of a slot of the same kind', () => {
  expect(mergeCrewSlots([{ category: CAM, quantity: 1 }], [{ category: CAM, quantity: 1 }]))
    .toEqual([{ category: CAM, quantity: 2 }]);
});

it('treats a different capability as a different slot', () => {
  expect(mergeCrewSlots(
    [{ category: CAM, quantity: 1 }],
    [{ category: CAM, quantity: 1, requiredCapability: 'drone' }],
  )).toEqual([
    { category: CAM, quantity: 1 },
    { category: CAM, quantity: 1, requiredCapability: 'drone' },
  ]);
});

it('appends a new category, leaving the existing slots untouched', () => {
  const existing = [{ category: CAM, quantity: 1 }];
  expect(mergeCrewSlots(existing, [{ category: 'Editor', quantity: 2 }]))
    .toEqual([{ category: CAM, quantity: 1 }, { category: 'Editor', quantity: 2 }]);
  expect(existing).toEqual([{ category: CAM, quantity: 1 }]);
});

it('opens a vacancy when the existing slot is already filled', () => {
  const crewSlots = mergeCrewSlots([{ category: CAM, quantity: 1 }], [{ category: CAM, quantity: 1 }]);
  const filledSlots = [{ category: CAM, professionalId: 'pro-1' }];

  expect(getVacantSlots({ crewSlots, filledSlots })).toEqual([{ category: CAM, quantity: 1 }]);
});
