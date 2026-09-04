import { renderHook, act } from '@testing-library/react-native';
import { capabilityOf, getSpecializations } from '../data/categories';
import { useCrewBuilder } from '../hooks/useCrewBuilder';
import { getVacantSlots } from '@features/noticeboard/matching';

/**
 * The role picker turns specialization rows into CrewRequestSlots. Two things
 * have to hold for the slots it writes to be usable downstream:
 *   1. each (category, capability) pair is counted separately, so one subskill
 *      row does not display or mutate another's quantity;
 *   2. the 'general' row becomes `undefined`, not the string 'general', or the
 *      slot can never be consumed by the fill that satisfies it.
 */
describe('capabilityOf', () => {
  it("maps 'general' to undefined — the absence of a requirement", () => {
    expect(capabilityOf('general')).toBeUndefined();
  });

  it('passes every other specialization id through unchanged', () => {
    expect(capabilityOf('drone')).toBe('drone');
    expect(capabilityOf('events')).toBe('events');
  });

  it("is total over every role's real specialization list", () => {
    const ids = getSpecializations('videographer').map((sp) => sp.id);
    expect(ids[0]).toBe('general'); // the convention capabilityOf depends on
    expect(ids.map(capabilityOf)).toEqual([undefined, ...ids.slice(1)]);
  });
});

describe('capability-aware slot selection', () => {
  const CATEGORY = 'Video Photographer';
  const DRONE = capabilityOf('drone');
  const GENERAL = capabilityOf('general');

  it('counts each (category, capability) pair separately', () => {
    const { result } = renderHook(() => useCrewBuilder());

    act(() => { result.current.addUnit(CATEGORY, GENERAL); });
    act(() => { result.current.addUnit(CATEGORY, DRONE); });

    // The bug this replaces: both rows read the same number.
    expect(result.current.unitCount(CATEGORY, GENERAL)).toBe(1);
    expect(result.current.unitCount(CATEGORY, DRONE)).toBe(1);

    act(() => { result.current.addUnit(CATEGORY, DRONE); });
    expect(result.current.unitCount(CATEGORY, GENERAL)).toBe(1);
    expect(result.current.unitCount(CATEGORY, DRONE)).toBe(2);
  });

  it('emits one grouped slot per capability, with general carrying no key', () => {
    const { result } = renderHook(() => useCrewBuilder());

    act(() => { result.current.addUnit(CATEGORY, GENERAL); });
    act(() => { result.current.addUnit(CATEGORY, DRONE); });

    expect(result.current.slots).toEqual([
      { category: CATEGORY, quantity: 1 },
      { category: CATEGORY, quantity: 1, requiredCapability: 'drone' },
    ]);
    // Not the string 'general' — that would make the slot unfillable.
    expect(result.current.slots[0]).not.toHaveProperty('requiredCapability');
  });

  it('removes only the matching capability', () => {
    const { result } = renderHook(() => useCrewBuilder());

    act(() => { result.current.addUnit(CATEGORY, GENERAL); });
    act(() => { result.current.addUnit(CATEGORY, DRONE); });
    act(() => { result.current.removeUnit(CATEGORY, DRONE); });

    expect(result.current.unitCount(CATEGORY, GENERAL)).toBe(1);
    expect(result.current.unitCount(CATEGORY, DRONE)).toBe(0);
    expect(result.current.slots).toEqual([{ category: CATEGORY, quantity: 1 }]);
  });

  it('produces slots that getVacantSlots can actually retire', () => {
    const { result } = renderHook(() => useCrewBuilder());

    act(() => { result.current.addUnit(CATEGORY, GENERAL); });
    act(() => { result.current.addUnit(CATEGORY, DRONE); });
    const crewSlots = result.current.slots;

    // A general fill (assignFilledCapability returns undefined for one) must
    // consume the general slot and leave the drone slot vacant.
    const afterGeneral = getVacantSlots({
      crewSlots,
      filledSlots: [{ category: CATEGORY, professionalId: 'p1' }],
    });
    expect(afterGeneral).toEqual([
      { category: CATEGORY, quantity: 1, requiredCapability: 'drone' },
    ]);

    // And a drone fill consumes the drone slot, not the general one.
    const afterBoth = getVacantSlots({
      crewSlots,
      filledSlots: [
        { category: CATEGORY, professionalId: 'p1' },
        { category: CATEGORY, professionalId: 'p2', requiredCapability: 'drone' },
      ],
    });
    expect(afterBoth).toEqual([]);
  });

  it("a slot written as the string 'general' would never be retired", () => {
    // Guards the regression capabilityOf exists to prevent: this is what the
    // obvious one-line fix (passing sp.id straight through) would have produced.
    const wrong = [{ category: CATEGORY, quantity: 1, requiredCapability: 'general' }];
    expect(
      getVacantSlots({
        crewSlots: wrong,
        filledSlots: [{ category: CATEGORY, professionalId: 'p1' }],
      }),
    ).toEqual(wrong);
  });
});
