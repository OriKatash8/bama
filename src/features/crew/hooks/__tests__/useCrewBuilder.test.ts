import { renderHook, act } from '@testing-library/react-native';
import { useCrewBuilder } from '../useCrewBuilder';

describe('useCrewBuilder', () => {
  it('starts with empty slots and totalCount 0', () => {
    const { result } = renderHook(() => useCrewBuilder());
    expect(result.current.slots).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });

  it('addSlot adds a new slot with quantity 1', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => { result.current.addSlot('Editor', 'Video Editor'); });
    expect(result.current.slots).toEqual([
      { category: 'Editor', subcategory: 'Video Editor', quantity: 1 },
    ]);
    expect(result.current.totalCount).toBe(1);
  });

  it('addSlot increments quantity when same category+subcategory already exists', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => {
      result.current.addSlot('Editor', 'Video Editor');
      result.current.addSlot('Editor', 'Video Editor');
    });
    expect(result.current.slots).toHaveLength(1);
    expect(result.current.slots[0].quantity).toBe(2);
    expect(result.current.totalCount).toBe(2);
  });

  it('addSlot creates a separate slot for a different subcategory', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => {
      result.current.addSlot('Editor', 'Video Editor');
      result.current.addSlot('Editor', 'Photo Editor');
    });
    expect(result.current.slots).toHaveLength(2);
  });

  it('removeSlot decrements quantity by 1', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => {
      result.current.addSlot('Editor', 'Video Editor');
      result.current.addSlot('Editor', 'Video Editor');
      result.current.removeSlot('Editor', 'Video Editor');
    });
    expect(result.current.slots[0].quantity).toBe(1);
  });

  it('removeSlot removes the slot when quantity reaches 0', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => {
      result.current.addSlot('Editor', 'Video Editor');
      result.current.removeSlot('Editor', 'Video Editor');
    });
    expect(result.current.slots).toHaveLength(0);
    expect(result.current.totalCount).toBe(0);
  });

  it('reset clears all slots', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => {
      result.current.addSlot('Editor', 'Video Editor');
      result.current.addSlot('Still Photographer', 'Fashion');
    });
    act(() => { result.current.reset(); });
    expect(result.current.slots).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });

  it('loadSlots replaces all current slots with the provided array', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => {
      result.current.addSlot('Editor', 'Video Editor');
    });
    act(() => {
      result.current.loadSlots([
        { category: 'Still Photographer', subcategory: 'Fashion', quantity: 2 },
      ]);
    });
    expect(result.current.slots).toEqual([
      { category: 'Still Photographer', subcategory: 'Fashion', quantity: 2 },
    ]);
    expect(result.current.totalCount).toBe(2);
  });
});
