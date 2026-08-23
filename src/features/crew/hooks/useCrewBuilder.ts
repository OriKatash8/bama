import { useState, useCallback } from 'react';
import type { CrewRequestSlot } from '@core/types/project';

export function useCrewBuilder() {
  const [slots, setSlots] = useState<CrewRequestSlot[]>([]);

  const totalCount = slots.reduce((sum, s) => sum + s.quantity, 0);

  function addSlot(category: string) {
    setSlots((prev) => {
      const existing = prev.find(s => s.category === category);
      if (existing) {
        return prev.map(s => s.category === category ? { ...s, quantity: s.quantity + 1 } : s);
      }
      return [...prev, { category, quantity: 1 }];
    });
  }

  function removeSlot(category: string) {
    setSlots((prev) => {
      const slot = prev.find(s => s.category === category);
      if (!slot) return prev;
      if (slot.quantity === 1) return prev.filter(s => s.category !== category);
      return prev.map(s => s.category === category ? { ...s, quantity: s.quantity - 1 } : s);
    });
  }

  function setRequiredCapability(category: string, capability: string | undefined) {
    setSlots((prev) =>
      prev.map((s) => (s.category === category ? { ...s, requiredCapability: capability } : s)),
    );
  }

  function reset() {
    setSlots([]);
  }

  const loadSlots = useCallback((newSlots: CrewRequestSlot[]) => {
    setSlots(newSlots);
  }, []);

  return { slots, totalCount, addSlot, removeSlot, setRequiredCapability, reset, loadSlots };
}
