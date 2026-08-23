import { renderHook, act } from '@testing-library/react-native';
import { useCrewBuilder } from '../useCrewBuilder';

describe('useCrewBuilder', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useCrewBuilder());
    expect(result.current.slots).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });

  it('setQuantity selects a role and controls its quantity (general slots)', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => { result.current.setQuantity('Editor', 1); });
    expect(result.current.roleQuantity('Editor')).toBe(1);
    expect(result.current.slots).toEqual([{ category: 'Editor', quantity: 1 }]);

    act(() => { result.current.setQuantity('Editor', 3); });
    expect(result.current.roleQuantity('Editor')).toBe(3);
    expect(result.current.slots).toEqual([{ category: 'Editor', quantity: 3 }]);
    expect(result.current.totalCount).toBe(3);
  });

  it('setQuantity to 0 removes the role', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => { result.current.setQuantity('Editor', 2); });
    act(() => { result.current.setQuantity('Editor', 0); });
    expect(result.current.slots).toEqual([]);
    expect(result.current.roleQuantity('Editor')).toBe(0);
  });

  it('slotCaps exposes one entry per slot (default general/undefined)', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => { result.current.setQuantity('Video Photographer', 2); });
    expect(result.current.slotCaps('Video Photographer')).toEqual([undefined, undefined]);
  });

  it('setSlotCapability assigns a per-slot subskill and groups into slots', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => { result.current.setQuantity('Video Photographer', 2); });
    act(() => { result.current.setSlotCapability('Video Photographer', 1, 'drone'); });
    expect(result.current.slotCaps('Video Photographer')).toEqual([undefined, 'drone']);
    // grouped: 1 general + 1 drone
    expect(result.current.slots).toEqual([
      { category: 'Video Photographer', quantity: 1 },
      { category: 'Video Photographer', quantity: 1, requiredCapability: 'drone' },
    ]);
  });

  it('shrinking quantity drops the tail slots', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => { result.current.setQuantity('Editor', 3); });
    act(() => { result.current.setSlotCapability('Editor', 0, 'colorist'); });
    act(() => { result.current.setQuantity('Editor', 1); });
    expect(result.current.slotCaps('Editor')).toEqual(['colorist']);
    expect(result.current.slots).toEqual([
      { category: 'Editor', quantity: 1, requiredCapability: 'colorist' },
    ]);
  });

  it('removeCategory drops the whole role', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => {
      result.current.setQuantity('Editor', 2);
      result.current.setSlotCapability('Editor', 0, 'colorist');
      result.current.removeCategory('Editor');
    });
    expect(result.current.slots).toEqual([]);
  });

  it('loadSlots round-trips grouped crewSlots into per-slot caps', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => {
      result.current.loadSlots([
        { category: 'Video Photographer', quantity: 1 },
        { category: 'Video Photographer', quantity: 1, requiredCapability: 'drone' },
      ]);
    });
    expect(result.current.slotCaps('Video Photographer')).toEqual([undefined, 'drone']);
    expect(result.current.totalCount).toBe(2);
    expect(result.current.slots).toEqual([
      { category: 'Video Photographer', quantity: 1 },
      { category: 'Video Photographer', quantity: 1, requiredCapability: 'drone' },
    ]);
  });

  it('addUnit/removeUnit still operate per (category, capability)', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => {
      result.current.addUnit('Editor');
      result.current.addUnit('Editor', 'colorist');
      result.current.removeUnit('Editor', 'colorist');
    });
    expect(result.current.slots).toEqual([{ category: 'Editor', quantity: 1 }]);
    expect(result.current.unitCount('Editor')).toBe(1);
  });

  it('reset clears everything', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => { result.current.setQuantity('Editor', 2); });
    act(() => { result.current.reset(); });
    expect(result.current.slots).toEqual([]);
  });
});
