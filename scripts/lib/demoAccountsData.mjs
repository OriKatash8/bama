/**
 * The data behind scripts/demo-accounts.mjs: the three App Review accounts and
 * everything between them. Nothing here is a secret — the password comes from
 * DEMO_PASSWORD at run time and is never written anywhere.
 *
 * ROLES mirrors src/features/crew/data/categories.ts (ids only);
 * scripts/__tests__/demoAccountsData.test.mjs fails if the two drift.
 */

export const ROLES = {
  videographer: ['general', 'events', 'ads_brands', 'music_video', 'social_reels', 'documentary', 'real_estate', 'drone'],
  photographer: ['general', 'events_parties', 'product_food', 'corporate', 'portrait', 'fashion', 'real_estate', 'magnet'],
  editor: ['general', 'video', 'photo', 'social', 'podcast', 'colorist', 'motion', 'vfx', 'ai_editing'],
  graphic_designer: ['general', 'branding', 'ui_ux', 'social_banners', 'landing_decks', 'print'],
  social_media: ['general', 'manager', 'content_creator', 'ppc'],
  studio_audio: ['general', 'music_producer', 'media_music', 'voiceover', 'mix_master'],
  sound: ['general', 'location_sound', 'sound_designer', 'boom', 'live_pa'],
  lighting: ['general', 'gaffer_grip', 'stage_event', 'studio'],
};

/** ROLE_TO_LEGACY_CATEGORY in categories.ts — the strings projects and offers store. */
export const LEGACY = {
  videographer: 'Video Photographer',
  photographer: 'Still Photographer',
  editor: 'Editor',
  graphic_designer: 'Graphic Designer',
  social_media: 'Social Media',
  studio_audio: 'Studio & Audio',
  sound: 'Sound Recordist',
  lighting: 'Lighting Tech',
};

/** Every role, with every specialization. */
export const ROLE_SKILLS = Object.entries(ROLES).map(([role, specializations]) => ({ role, specializations: [...specializations] }));

/**
 * Fixed uids, so an account deleted by a reviewer comes back under the same id —
 * and with it the same Storage paths, so a restored portfolio keeps its URLs.
 * Phones are Ofcom's drama range (07700 900000-900999): never a subscriber's.
 */
export const ACCOUNTS = [
  {
    key: 'test1', uid: 'demo-test1', email: 'bama.app.hk+test1@gmail.com', displayName: 'test1', phone: '+447700900001',
    bio: 'Videographer and editor based in Tel Aviv. Weddings, brand films and short-form content, from the shoot to the final grade.',
    equipment: [
      { name: 'Sony FX3', category: 'camera' },
      { name: 'Sony A7 IV', category: 'camera' },
      { name: 'Sony FE 24-70mm f/2.8 GM II', category: 'lens' },
      { name: 'Sony FE 85mm f/1.4 GM', category: 'lens' },
      { name: 'Rode NTG5 shotgun microphone', category: 'audio' },
      { name: 'Sennheiser EW-DP wireless lavalier kit', category: 'audio' },
      { name: 'Aputure LS 300d II', category: 'lighting' },
      { name: 'Aputure MC RGB (x4)', category: 'lighting' },
      { name: 'DJI RS 3 Pro gimbal', category: 'grip' },
      { name: 'DJI Mini 4 Pro', category: 'drone' },
    ],
    priceList: [{ service: 'Half-day shoot', price: 1800 }, { service: 'Full-day shoot', price: 3200 }, { service: 'Edit, per finished minute', price: 450 }],
  },
  {
    key: 'test2', uid: 'demo-test2', email: 'bama.app.hk+test2@gmail.com', displayName: 'test2', phone: '+447700900002',
    bio: 'Photographer and lighting tech. Corporate events, product and food, and studio portraits.',
    equipment: [
      { name: 'Canon EOS R5', category: 'camera' },
      { name: 'Canon EOS R6 Mark II', category: 'camera' },
      { name: 'Canon RF 24-70mm f/2.8L IS USM', category: 'lens' },
      { name: 'Canon RF 70-200mm f/2.8L IS USM', category: 'lens' },
      { name: 'Canon RF 100mm f/2.8L Macro', category: 'lens' },
      { name: 'Godox AD600 Pro (x2)', category: 'lighting' },
      { name: 'Profoto B10X', category: 'lighting' },
      { name: 'Rode Wireless PRO', category: 'audio' },
      { name: 'Manfrotto 055 tripod', category: 'grip' },
      { name: 'Zhiyun Crane 4 gimbal', category: 'grip' },
    ],
    priceList: [{ service: 'Event coverage, 3 hours', price: 1500 }, { service: 'Product shoot, 10 images', price: 1200 }],
  },
  {
    key: 'test3', uid: 'demo-test3', email: 'bama.app.hk+test3@gmail.com', displayName: 'test3', phone: '+447700900003',
    bio: 'Location sound, post-production audio and cinema-camera operation for documentaries and music videos.',
    equipment: [
      { name: 'Blackmagic Pocket Cinema Camera 6K Pro', category: 'camera' },
      { name: 'Blackmagic URSA Mini Pro 12K', category: 'camera' },
      { name: 'Sigma 18-35mm f/1.8 Art', category: 'lens' },
      { name: 'Sigma 50-100mm f/1.8 Art', category: 'lens' },
      { name: 'Sound Devices MixPre-6 II recorder', category: 'audio' },
      { name: 'Sennheiser MKH 416 shotgun microphone', category: 'audio' },
      { name: 'Deity Theos wireless kit', category: 'audio' },
      { name: 'Nanlite Forza 500', category: 'lighting' },
      { name: 'Tilta Nucleus-M follow focus', category: 'grip' },
      { name: 'DJI Ronin 2 stabilizer', category: 'grip' },
    ],
    priceList: [{ service: 'Location sound, full day', price: 1600 }, { service: 'Mix and master, per song', price: 700 }],
  },
];

export const byKey = Object.fromEntries(ACCOUNTS.map((a) => [a.key, a]));
export const DEMO_UIDS = ACCOUNTS.map((a) => a.uid);

/**
 * Completed projects: in each, the client hires the other two, both finish, the
 * client confirms and reviews both. Every account ends with two reviews, one from
 * each of the others, each behind a real completed engagement.
 */
export const COMPLETED = [
  {
    key: 'done1', client: 'test1', title: 'Product launch video', location: 'Tel Aviv',
    description: 'Two-minute launch film for a new coffee brand: studio product shots and a short interview.',
    crew: [{ pro: 'test2', role: 'photographer', price: 1200 }, { pro: 'test3', role: 'sound', price: 900 }],
    reviews: { test2: [5, 'Beautiful stills, on time and very easy to work with.'], test3: [5, 'Clean audio on a noisy location. Would book again.'] },
    messages: [['test1', 'Hi both, call time is 9:00 at the studio.'], ['test2', 'Great, I will bring the Profoto kit.'], ['test3', 'I will set up audio by 8:45.']],
  },
  {
    key: 'done2', client: 'test2', title: 'Corporate conference', location: 'Jerusalem',
    description: 'Full-day conference: stage recording, interviews in the lobby and a highlights reel.',
    crew: [{ pro: 'test1', role: 'videographer', price: 2400 }, { pro: 'test3', role: 'lighting', price: 1100 }],
    reviews: { test1: [5, 'The highlights reel was ready the next day. Excellent work.'], test3: [4, 'Good stage lighting, professional and calm under pressure.'] },
    messages: [['test2', 'Parking is under the venue, level -2.'], ['test1', 'Thanks! Two cameras on the stage, one roaming.'], ['test3', 'Lights will be ready by 8:30.']],
  },
  {
    key: 'done3', client: 'test3', title: 'Music video shoot', location: 'Haifa',
    description: 'One-day music video shoot on location, with an edit and colour grade.',
    crew: [{ pro: 'test1', role: 'editor', price: 1500 }, { pro: 'test2', role: 'photographer', price: 800 }],
    reviews: { test1: [5, 'Great edit and colour, the band loved it.'], test2: [5, 'Stunning behind-the-scenes photos for the release.'] },
    messages: [['test3', 'Sharing the moodboard here tonight.'], ['test1', 'Looks great. I will cut a first draft by Sunday.'], ['test2', 'I will shoot stills between takes.']],
  },
];

/** Hired and confirmed, not completed: test2 is the client, test3 the pro. */
export const ACTIVE = {
  key: 'active', client: 'test2', title: 'Restaurant opening campaign', location: 'Tel Aviv',
  description: 'Social content for a restaurant opening: reels, food photography and a short promo.',
  crew: [{ pro: 'test3', role: 'videographer', price: 1900 }],
  deadlineDays: 120,
  messages: [['test2', 'Opening night is next month, I will send the menu.'], ['test3', 'Perfect, I will plan the shot list.']],
};

/** Open, with two vacant seats and a pending offer on each. */
export const OPEN = {
  key: 'open', client: 'test1', title: 'Wedding videography and sound', location: 'Netanya',
  description: 'Looking for a videographer and a sound recordist for a 200-guest wedding.',
  crew: [{ role: 'videographer' }, { role: 'sound' }],
  offers: [{ pro: 'test2', role: 'videographer', price: 2800 }, { pro: 'test3', role: 'sound', price: 1300 }],
  deadlineDays: 45,
};

export const DM = { a: 'test1', b: 'test2', messages: [['test1', 'Hi! Are you free for a shoot next week?'], ['test2', 'Yes, Tuesday and Thursday are open.'], ['test1', 'Great, I will send details.']] };

export const LISTINGS = {
  sale: {
    by: 'test1', type: 'secondhand', productName: 'Sony FE 24-105mm f/4 G OSS', location: 'Tel Aviv', price: 2900,
    condition: 'like_new', category: 'lens', subcategory: null, brand: 'Sony',
  },
  rental: {
    by: 'test2', type: 'rental', productName: 'Godox AD600 Pro lighting kit', location: 'Jerusalem', price: 180,
    condition: null, category: 'lighting', subcategory: null, brand: 'Godox', storeName: 'test2 Rentals', productUrl: null, pricePeriod: 'day',
  },
};
