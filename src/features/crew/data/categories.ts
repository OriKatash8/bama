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
      { id: 'content_creator', he: 'יוצר תוכן ויזואלי',      en: 'Content Creator' },
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

// ── Phase 1 back-compat (DEPRECATED) ─────────────────────────────────────────
// TODO Phase 2/3: migrate the CREW_CATEGORIES (11) + CATEGORY_LABEL_KEY (8) call
// sites to the ROLES model above, then delete this block. Preserved verbatim from
// the previous data file so existing Firestore data + all screens render identically.
/** @deprecated Phase 1 compat — use ROLES / getSpecializations(). */
export const CREW_CATEGORIES: Record<string, string[]> = {
  'Video Photographer': [
    'Music Video', 'Event', 'Fashion', 'Food', 'Product', 'Sports',
    'Concert', 'Documentary', 'Drone', 'Social Media', 'Other',
  ],
  'Still Photographer': [
    'Fashion', 'Product', 'Food', 'Portrait', 'Corporate Headshot',
    'Event', 'Concert', 'Party', 'Sports', 'Real Estate', 'Nature',
    'Journalism', 'Other',
  ],
  'Editor': [
    'Video Editor', 'Photo Editor', 'Colorist', 'Sound Editor', 'Animator',
    'VFX Artist', 'CGI Specialist', 'Effects Designer', 'Subtitle Creator',
    'TikTok/Reels Editor', 'YouTube Editor',
  ],
  'Graphic Designer': [
    'Graphic Designer', 'Cover Art', 'Logo Designer', 'Poster Designer',
    'Illustrator', 'UI/UX Designer', 'Presentation Designer',
    'Branding Specialist', 'Animator', 'Motion Graphics',
  ],
  'Social Media': [
    'Social Media Manager', 'Content Creator', 'Campaign Manager',
    'TikToker', 'Reels Creator', 'Instagram Manager', 'YouTube Expert',
    'SEO Specialist', 'Copywriter', 'Digital Marketer',
  ],
  'Studio & Audio': [
    'Recording Studio', 'Music Producer', 'Songwriter', 'Composer',
    'Backup Singer', 'Rapper', 'DJ', 'Guitarist', 'Pianist', 'Drummer',
    'Violinist', 'Saxophonist', 'Voiceover Artist', 'Dubbing Artist',
    'Beatmaker', 'Studio Technician',
  ],
  'Lighting Tech': ['Studio/Commercial', 'Event', 'Stage/Concert', 'Gaffer', 'Other'],
  'Sound Recordist': [
    'Field Recordist (Film/TV)', 'Live Event Sound Tech',
    'Post-Production Mixer', 'Podcast/Interview Tech', 'Other',
  ],
};

/**
 * @deprecated Phase 2 compat — role id → legacy CREW_CATEGORIES key. Used to keep the
 * synced `ProfessionalProfile.skills` (legacy `{category}`) in step with `roleSkills`,
 * so read-only readers (dashboard noticeboard filter, browse-profile) keep working.
 * TODO Phase 3: migrate those readers to `roleSkills`, then delete.
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

/** @deprecated Phase 1 compat — use ROLES + labelOf(). */
export const CATEGORY_LABEL_KEY: Record<string, string> = {
  'Video Photographer': 'builder.category_videographer',
  'Still Photographer': 'builder.category_photographer',
  'Editor':             'builder.category_editor',
  'Graphic Designer':   'builder.category_graphic_designer',
  'Social Media':       'builder.category_social',
  'Studio & Audio':     'builder.category_studios',
  'Lighting Tech':      'builder.category_lighting',
  'Sound Recordist':    'builder.category_sound',
};
