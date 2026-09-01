// src/features/crew/data/categories.ts  (roles → subskills/specializations)

export type Labeled = {
  id: string;   // stable, internal — used for matching. never shown.
  he: string;   // Hebrew display label
  en: string;   // English display label
};

export type RoleDef = {
  id: string;
  he: string;
  en: string;
  specializations: Labeled[]; // subskills; first is always 'general'
};

export const ROLES: RoleDef[] = [
  {
    id: 'videographer',
    he: 'צלם וידאו',
    en: 'Videographer',
    specializations: [
      { id: 'general',       he: 'כללי',                   en: 'General' },
      { id: 'events',        he: 'אירועים',                en: 'Events' },
      { id: 'ads_brands',    he: 'פרסומות ומותגים',        en: 'Ads & Brands' },
      { id: 'music_video',   he: 'קליפים',                 en: 'Music Video' },
      { id: 'social_reels',  he: 'רשתות חברתיות / רילס',    en: 'Social / Reels' },
      { id: 'documentary',   he: 'דוקומנטרי וראיונות',      en: 'Documentary & Interviews' },
      { id: 'real_estate',   he: 'נדל"ן',                  en: 'Real Estate' },
      { id: 'drone',         he: 'צילום מהאוויר / רחפן',    en: 'Aerial / Drone' },
    ],
  },
  {
    id: 'photographer',
    he: 'צלם תמונות',
    en: 'Stills Photographer',
    specializations: [
      { id: 'general',        he: 'כללי',                  en: 'General' },
      { id: 'events_parties', he: 'אירועים ומסיבות',        en: 'Events & Parties' },
      { id: 'product_food',   he: 'מוצר ואוכל',             en: 'Product & Food' },
      { id: 'corporate',      he: 'תדמית, עסקי וכנסים',      en: 'Corporate & Conferences' },
      { id: 'portrait',       he: 'פורטרטים ובוק אישי',      en: 'Portrait & Personal' },
      { id: 'fashion',        he: 'אופנה ופרסום',           en: 'Fashion & Advertising' },
      { id: 'real_estate',    he: 'נדל"ן ואדריכלות',         en: 'Real Estate & Architecture' },
      { id: 'magnet',         he: 'צילום מגנטים',           en: 'Magnet Photos' },
    ],
  },
  {
    id: 'editor',
    he: 'עורך',
    en: 'Editor',
    specializations: [
      { id: 'general',    he: 'כללי',                    en: 'General' },
      { id: 'video',      he: 'עריכת וידאו',              en: 'Video Editing' },
      { id: 'photo',      he: 'עריכת תמונות',             en: 'Photo Editing' },
      { id: 'social',     he: 'עריכת תוכן לרשתות',        en: 'Social Content Editing' },
      { id: 'podcast',    he: 'עריכת פודקאסט',            en: 'Podcast Editing' },
      { id: 'colorist',   he: 'עריכת צבע (Colorist)',     en: 'Colorist' },
      { id: 'motion',     he: 'אנימציה ומושן גרפיקס',     en: 'Animation & Motion Graphics' },
      { id: 'vfx',        he: 'אפקטים מיוחדים (VFX / CGI)', en: 'VFX / CGI' },
      { id: 'ai_editing', he: 'עריכת AI',                en: 'AI Editing' },
    ],
  },
  {
    id: 'graphic_designer',
    he: 'גרפיקאי',
    en: 'Graphic Designer',
    specializations: [
      { id: 'general',        he: 'כללי',                 en: 'General' },
      { id: 'branding',       he: 'מיתוג לעסקים',          en: 'Brand Identity' },
      { id: 'ui_ux',          he: 'עיצוב דיגיטלי (UI/UX)',  en: 'Digital (UI/UX)' },
      { id: 'social_banners', he: 'רשתות חברתיות ובאנרים',  en: 'Social & Banners' },
      { id: 'landing_decks',  he: 'דפי נחיתה ומצגות',       en: 'Landing Pages & Decks' },
      { id: 'print',          he: 'דפוס ושילוט',           en: 'Print & Signage' },
    ],
  },
  {
    id: 'social_media',
    he: 'סושיאל',
    en: 'Social Media',
    specializations: [
      { id: 'general',         he: 'כללי',                 en: 'General' },
      { id: 'manager',         he: 'ניהול סושיאל (אסטרטגיה)', en: 'Social Manager' },
      { id: 'content_creator', he: 'יוצר תוכן UGC',          en: 'UGC Content Creator' },
      { id: 'ppc',             he: 'קמפיינים ממומנים (PPC)', en: 'PPC / Paid Campaigns' },
    ],
  },
  {
    id: 'studio_audio',
    he: 'אולפן הקלטות',
    en: 'Studio & Audio',
    specializations: [
      { id: 'general',        he: 'כללי',            en: 'General' },
      { id: 'music_producer', he: 'מפיק מוזיקלי',     en: 'Music Producer' },
      { id: 'media_music',    he: 'יוצר מוזיקה למדיה', en: 'Music for Media' },
      { id: 'voiceover',      he: 'קריינות / דיבוב',   en: 'Voiceover / Dubbing' },
      { id: 'mix_master',     he: 'מיקס ומאסטרינג',    en: 'Mixing & Mastering' },
    ],
  },
  {
    id: 'sound',
    he: 'סאונדמן',
    en: 'Sound',
    specializations: [
      { id: 'general',        he: 'כללי',                      en: 'General' },
      { id: 'location_sound', he: 'מקליט שטח (Location Sound)',  en: 'Location Sound' },
      { id: 'sound_designer', he: 'מעצב פסקול',                 en: 'Sound Designer' },
      { id: 'boom',           he: 'איש בום',                    en: 'Boom Operator' },
      { id: 'live_pa',        he: 'הגברה לאירועים',              en: 'Live Event PA' },
    ],
  },
  {
    id: 'lighting',
    he: 'תאורן',
    en: 'Lighting',
    specializations: [
      { id: 'general',     he: 'כללי',                          en: 'General' },
      { id: 'gaffer_grip', he: 'שטח וצילומים (Gaffer & Grip)',   en: 'Gaffer & Grip' },
      { id: 'stage_event', he: 'אירועים ובמה',                   en: 'Stage & Event' },
      { id: 'studio',      he: 'סטודיו ופנים',                   en: 'Studio & Interior' },
    ],
  },
];

export const ROLE_BY_ID: Record<string, RoleDef> =
  Object.fromEntries(ROLES.map((r) => [r.id, r]));

export function getRole(roleId: string): RoleDef | undefined {
  return ROLE_BY_ID[roleId];
}

export function getSpecializations(roleId: string): Labeled[] {
  return ROLE_BY_ID[roleId]?.specializations ?? [];
}

export function labelOf(item: Labeled, lang: 'he' | 'en'): string {
  return lang === 'he' ? item.he : item.en;
}

/**
 * Role id → legacy category string. Retained as the normalization layer: `crewSlot.category`
 * is persisted as these legacy strings (on projects, offers, filledSlots, CATEGORY_QUESTION_MAP),
 * so builders emit them and `roleIdForCategory`/`categoryLabel` map back to the role.
 */
export const ROLE_TO_LEGACY_CATEGORY: Record<string, string> = {
  videographer:     'Video Photographer',
  photographer:     'Still Photographer',
  editor:           'Editor',
  graphic_designer: 'Graphic Designer',
  social_media:     'Social Media',
  studio_audio:     'Studio & Audio',
  sound:            'Sound Recordist',
  lighting:         'Lighting Tech',
};

// ── Normalization + display helpers (roles → labels) ─────────────────────────
// Reverse of ROLE_TO_LEGACY_CATEGORY: legacy stored category string → RoleDef id.
const LEGACY_CATEGORY_TO_ROLE: Record<string, string> = Object.fromEntries(
  Object.entries(ROLE_TO_LEGACY_CATEGORY).map(([role, cat]) => [cat, role]),
);

/** Display label for a stored category (legacy string OR role id); falls back to the input. */
export function categoryLabel(category: string, lang: 'he' | 'en'): string {
  const role = ROLE_BY_ID[LEGACY_CATEGORY_TO_ROLE[category] ?? category];
  return role ? labelOf(role, lang) : category;
}

/** Ordered legacy category strings for role pickers/filters (one per role, in ROLES order). */
export const ROLE_CATEGORIES: string[] = ROLES.map((r) => ROLE_TO_LEGACY_CATEGORY[r.id]).filter(Boolean);
