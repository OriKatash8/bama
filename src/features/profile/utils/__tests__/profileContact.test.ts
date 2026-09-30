import { profileContactErrors, EQUIPMENT_MAX } from '../profileContact';

/** Which public profile fields carry a phone number (Terms §6.8). */

it('a clean profile has no errors', () => {
  const r = profileContactErrors({ bio: 'צלם וידאו, 10 שנות ניסיון', equipment: [{ name: 'Sony 24-70mm f/2.8', category: 'lens' }] });
  expect(r).toEqual({ bio: false, equipmentIndexes: [], any: false });
});

it('flags a phone in the bio', () => {
  const r = profileContactErrors({ bio: 'צלמו אלי 054-7654321', equipment: [] });
  expect(r.bio).toBe(true);
  expect(r.any).toBe(true);
});

it('marks exactly the equipment items that carry a phone', () => {
  const r = profileContactErrors({
    bio: '',
    equipment: [
      { name: 'FX3', category: 'camera' },
      { name: 'call 052-123-4567', category: 'other' },
      'A7S III',
      '0521234567',
    ],
  });
  expect(r.equipmentIndexes).toEqual([1, 3]);
  expect(r.any).toBe(true);
});

it('caps equipment at 15 items (the rules check each position by hand)', () => {
  expect(EQUIPMENT_MAX).toBe(15);
});
