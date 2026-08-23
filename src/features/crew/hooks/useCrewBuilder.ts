import { useState, useCallback, useMemo } from 'react';
import type { CrewRequestSlot } from '@core/types/project';

/** Per-role slot capabilities: one array per category, length = that role's quantity.
 *  Each element is the chosen subskill id, or `undefined` for a general slot. */
type CapArrays = Record<string, (string | undefined)[]>;

const norm = (cap?: string) => cap ?? undefined;

/** Group each category's cap-array into the grouped crewSlots shape matching consumes. */
function groupToSlots(caps: CapArrays): CrewRequestSlot[] {
  const out: CrewRequestSlot[] = [];
  for (const [category, arr] of Object.entries(caps)) {
    const counts = new Map<string, number>(); // key '' = general; insertion order preserved
    for (const c of arr) {
      const key = c ?? '';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [key, quantity] of counts) {
      const slot: CrewRequestSlot = { category, quantity };
      if (key) slot.requiredCapability = key;
      out.push(slot);
    }
  }
  return out;
}

/**
 * Crew builder state.
 * Step 2 sets each role's QUANTITY (setQuantity); Step 3 sets each individual slot's
 * subskill (setSlotCapability). `slots` is derived — grouped by (category, capability) —
 * so a role can mix, e.g. 1 general + 1 drone videographer.
 */
export function useCrewBuilder() {
  const [caps, setCaps] = useState<CapArrays>({});

  const slots = useMemo(() => groupToSlots(caps), [caps]);
  const totalCount = useMemo(
    () => Object.values(caps).reduce((sum, arr) => sum + arr.length, 0),
    [caps],
  );

  // ── reads ──
  /** How many slots a role has (its quantity). */
  const roleQuantity = useCallback((category: string) => caps[category]?.length ?? 0, [caps]);
  /** Alias kept for back-compat with older callers. */
  const totalForCategory = roleQuantity;
  /** The per-slot capability array for a role (Step 3 renders one row per element). */
  const slotCapsFor = useCallback(
    (category: string): (string | undefined)[] => caps[category] ?? [],
    [caps],
  );
  /** Count of slots for a specific (category, capability) pair. */
  const unitCount = useCallback(
    (category: string, cap?: string) =>
      (caps[category] ?? []).filter((c) => norm(c) === norm(cap)).length,
    [caps],
  );

  // ── writes ──
  /** Step 2: set a role's quantity (grow → general slots; shrink → drop tail; 0 → remove). */
  function setQuantity(category: string, n: number) {
    setCaps((prev) => {
      const next = { ...prev };
      if (n <= 0) {
        delete next[category];
        return next;
      }
      const cur = prev[category] ?? [];
      if (n === cur.length) return prev;
      next[category] =
        n < cur.length ? cur.slice(0, n) : [...cur, ...Array(n - cur.length).fill(undefined)];
      return next;
    });
  }

  /** Step 3: set an individual slot's capability (undefined = general). */
  function setSlotCapability(category: string, index: number, cap: string | undefined) {
    setCaps((prev) => {
      const cur = prev[category];
      if (!cur || index < 0 || index >= cur.length) return prev;
      const arr = cur.slice();
      arr[index] = norm(cap);
      return { ...prev, [category]: arr };
    });
  }

  /** Append one slot of the given capability (default general). */
  function addUnit(category: string, cap?: string) {
    setCaps((prev) => ({ ...prev, [category]: [...(prev[category] ?? []), norm(cap)] }));
  }

  /** Remove the last slot matching the given capability; drop the role if it becomes empty. */
  function removeUnit(category: string, cap?: string) {
    setCaps((prev) => {
      const cur = prev[category];
      if (!cur) return prev;
      const idx = [...cur].reverse().findIndex((c) => norm(c) === norm(cap));
      if (idx === -1) return prev;
      const removeAt = cur.length - 1 - idx;
      const arr = cur.slice(0, removeAt).concat(cur.slice(removeAt + 1));
      const next = { ...prev };
      if (arr.length === 0) delete next[category];
      else next[category] = arr;
      return next;
    });
  }

  /** Remove a role entirely (all its slots). */
  function removeCategory(category: string) {
    setCaps((prev) => {
      if (!prev[category]) return prev;
      const next = { ...prev };
      delete next[category];
      return next;
    });
  }

  function reset() {
    setCaps({});
  }

  /** Load grouped crewSlots (edit mode) → expand into per-slot cap arrays. */
  const loadSlots = useCallback((newSlots: CrewRequestSlot[]) => {
    const next: CapArrays = {};
    for (const s of newSlots ?? []) {
      const arr = next[s.category] ?? (next[s.category] = []);
      for (let i = 0; i < s.quantity; i++) arr.push(norm(s.requiredCapability));
    }
    setCaps(next);
  }, []);

  return {
    slots,
    totalCount,
    roleQuantity,
    totalForCategory,
    slotCaps: slotCapsFor,
    unitCount,
    setQuantity,
    setSlotCapability,
    addUnit,
    removeUnit,
    removeCategory,
    reset,
    loadSlots,
  };
}
