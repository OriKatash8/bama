// Course difficulty levels.
//
// Historically `level` was persisted as a translated *display label* (e.g. the
// Hebrew "מתחילים" or English "Beginner"), which made it language-dependent and
// impossible to filter reliably across locales. We now store a stable key and
// normalize any legacy stored value back to that key for display + filtering.

export type CourseLevelKey = 'beginner' | 'intermediate' | 'advanced';

export const COURSE_LEVEL_KEYS: CourseLevelKey[] = ['beginner', 'intermediate', 'advanced'];

// Maps a stored value (new stable key OR legacy en/he display label) → key.
const LEGACY: Record<string, CourseLevelKey> = {
  beginner: 'beginner',
  intermediate: 'intermediate',
  advanced: 'advanced',
  'מתחילים': 'beginner',
  'בינוני': 'intermediate',
  'מתקדם': 'advanced',
};

/** Normalize a stored level value to a stable key, or null if unrecognized. */
export function normalizeLevel(raw?: string | null): CourseLevelKey | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (lower === 'beginner' || lower === 'intermediate' || lower === 'advanced') {
    return lower as CourseLevelKey;
  }
  return LEGACY[raw.trim()] ?? null;
}

/** i18n key for a level's localized label. */
export function levelLabelKey(key: CourseLevelKey): string {
  return `courses.level_${key}`;
}
