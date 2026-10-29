import type { BamaCategory } from './categories';

/**
 * Keyword rules that SUGGEST a category for an item no category map placed.
 * A suggestion is never shown to users on its own: it pre-selects the admin's
 * "Needs sorting" dropdown (resolveCategory keeps such items 'unsorted').
 *
 * Matching is per word, never per substring — "mm" inside "Rod 15mm" or "lens"
 * inside another word cannot fire. A term with spaces is a phrase: its words
 * must appear consecutively. Hebrew words also match with one or two of the
 * prefixes ב ל ה ו in front (למצלמה, ולפנסים); English words also match with a
 * trailing "s". Geresh and quote marks are dropped first, so ג'אמפר is גאמפר.
 *
 * Scoring: each distinct term that matches adds 1 (a phrase adds 2, being more
 * specific). The highest score wins; a tie goes to the rule listed first.
 */
export type KeywordRule = {
  category: BamaCategory;
  terms: string[];
  /** Whole-word patterns, tested against each single word (already lower-cased). */
  patterns?: RegExp[];
};

export const KEYWORD_RULES: KeywordRule[] = [
  {
    category: 'camera',
    terms: [
      'מצלמה', 'מצלמת', 'מצלמות', 'camera', 'cinema camera', 'מצלמת קולנוע',
      'alexa', 'komodo', 'ursa', 'bmpcc', 'pocket cinema', 'gopro', 'insta360', 'osmo',
      'fx3', 'fx5', 'fx6', 'fx9', 'fx30', 'fx4v', 'a7iv', 'a7siii', 'a7riv', 'a7rv', 'c70', 'c300', 'c500',
    ],
  },
  {
    category: 'drone',
    terms: ['רחפן', 'רחפנים', 'drone', 'mavic', 'avata', 'inspire', 'fpv', 'mini 4 pro', 'air 3'],
  },
  {
    category: 'audio',
    terms: [
      'מיקרופון', 'מקרופון', 'מיקרופונים', 'microphone', 'mic', 'lav', 'lavalier', 'לוולייר', 'shotgun', 'שוטגן',
      'סאונד', 'sound', 'audio', 'אודיו', 'הקלטה', 'recorder', 'מיקסר', 'mixer', 'אוזניות', 'headphones',
      'boom pole', 'סט בום', 'sennheiser', 'rode', 'shure', 'zoom', 'tascam', 'rycote', 'צפלין',
      'lectrosonics', 'dpa', 'sanken', 'sound devices', 'videomic', 'xlr', 'timecode',
    ],
  },
  {
    category: 'lighting',
    terms: [
      'פנס', 'פנסים', 'פנסי', 'תאורה', 'לד', 'light', 'led', 'aputure', 'amaran', 'godox', 'nanlite', 'nanlux',
      'nanguang', 'astera', 'fresnel', 'פרנל', 'softbox', 'lantern', 'lightdome', 'light dome', 'ריכוך',
      'צימרה', 'chimera', 'reflector', 'מחזיר אור', 'פלאש', 'flash', 'dmx', 'נורה', 'נורת', 'נורות', 'light tube',
      'מד אור', 'sekonic',
    ],
  },
  {
    category: 'lens',
    terms: [
      'עדשה', 'עדשת', 'עדשות', 'lens', 'lenses', 'anamorphic', 'אנמורפית', 'אנמורפיות', 'teleconverter',
      'מכפיל', 'fisheye', 'עין הדג', 'macro', 'זום', 'zoom lens', 'prime cine', 'פילטר', 'פילטרים', 'filter',
      'nd', 'black diffusion',
    ],
    // A focal length is a number glued to "mm" (24mm, 70mm) — never "mm" alone.
    patterns: [/^\d{1,3}mm$/],
  },
  {
    category: 'accessories',
    terms: [
      'מוניטור', 'monitor', 'משדר', 'משדרי', 'transmitter', 'hollyland', 'accsoon', 'atomos', 'smallhd',
      'follow focus', 'פולו פוקוס', 'פוקוס', 'nucleus', 'matte box', 'מאט בוקס', 'מטבוקס', 'cage', 'כלוב',
      'rig', 'ריג', 'מכתוף', 'shoulder rig', 'כרטיס זיכרון', 'כרטיסים', 'card reader', 'ssd', 'ממיר',
      'converter', 'sdi', 'hdmi', 'atem', 'גאמפר', 'תיק מצלמה', 'camera bag',
    ],
  },
  {
    category: 'grip',
    terms: [
      'חצובה', 'חצובת', 'חצובות', 'tripod', 'סטנד', 'stand', 'c stand', 'slider', 'סליידר', 'dolly', 'דולי',
      'gimbal', 'גימבל', 'ronin', 'rs3', 'rs4', 'rs 3', 'rs 4', 'מייצב', 'easyrig', 'clamp', 'מלחץ', 'קלאמפ',
      'magic arm', 'מגיק ארמ', 'זרוע', 'arm', 'apple box', 'קוב', 'שק חול', 'sandbag', 'grip', 'גריפ',
      'combo', 'קומבו', 'baby legs', 'hi hat', 'fluid head', 'ראש וידאו', 'ראש גריפ', 'turtle base',
    ],
  },
  {
    category: 'production',
    terms: [
      'מכשירי קשר', 'walkie', 'walkie talkie', 'אוזניות תקשורת', 'intercom', 'כיסא', 'chair', 'שולחן', 'table',
      'אוהל', 'גזיבו', 'gazebo', 'גנרטור', 'generator', 'סוללה', 'סוללת', 'battery', 'v lock', 'vlock',
      'np f', 'מטען', 'charger', 'מפצל', 'd tap', 'חשמל', 'מאוורר', 'fan', 'עשן', 'smoke', 'ערפל', 'haze',
      'hazer', 'מראה', 'מראת', 'clapper', 'קלאפר', 'טלפרומפטר', 'teleprompter', 'תנור', 'עגלה', 'עגלת',
      'cart', 'magliner', 'מקרן', 'projector',
    ],
  },
  {
    category: 'studio',
    terms: ['סטודיו', 'studio', 'רקע', 'רקעים', 'backdrop', 'מסך ירוק', 'green screen'],
  },
];

const HEBREW_PREFIXES = 'בלהו';
const HEBREW_LETTER = /[א-ת]/;

/** Lower-cased words, with geresh/quote marks removed so ג'אמפר is one word. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['"`׳״‘’“”]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** The forms a word may take when compared with a term word. */
export function wordForms(word: string): string[] {
  const forms = [word];
  if (HEBREW_LETTER.test(word[0] ?? '')) {
    // Up to two one-letter prefixes (ו+ל, ו+ה, ל+ה…), keeping at least two letters.
    let w = word;
    for (let i = 0; i < 2 && w.length > 3 && HEBREW_PREFIXES.includes(w[0]); i++) {
      w = w.slice(1);
      forms.push(w);
    }
  } else if (word.length > 3 && word.endsWith('s')) {
    forms.push(word.slice(0, -1));
  }
  return forms;
}

type CompiledRule = { category: BamaCategory; terms: string[][]; patterns: RegExp[] };

function compile(rules: KeywordRule[]): CompiledRule[] {
  return rules.map((r) => ({
    category: r.category,
    terms: r.terms.map(tokenize).filter((t) => t.length > 0),
    patterns: r.patterns ?? [],
  }));
}

const COMPILED = compile(KEYWORD_RULES);

function phraseAt(words: string[][], i: number, phrase: string[]): boolean {
  if (i + phrase.length > words.length) return false;
  return phrase.every((p, k) => words[i + k].includes(p));
}

/** Per-category score for a text. Exported for tests and the admin's reasoning. */
export function scoreText(text: string, rules: KeywordRule[] = KEYWORD_RULES): Map<BamaCategory, number> {
  const compiled = rules === KEYWORD_RULES ? COMPILED : compile(rules);
  const words = tokenize(text).map(wordForms);
  const scores = new Map<BamaCategory, number>();
  for (const rule of compiled) {
    let score = 0;
    for (const phrase of rule.terms) {
      for (let i = 0; i < words.length; i++) {
        if (phraseAt(words, i, phrase)) { score += phrase.length > 1 ? 2 : 1; break; }
      }
    }
    for (const re of rule.patterns) {
      if (words.some((forms) => re.test(forms[0]))) score += 1;
    }
    if (score > 0) scores.set(rule.category, (scores.get(rule.category) ?? 0) + score);
  }
  return scores;
}

/** The best-scoring category for an item's name, or null when nothing matched. */
export function suggestCategory(name: string, rules: KeywordRule[] = KEYWORD_RULES): BamaCategory | null {
  const scores = scoreText(name, rules);
  let best: BamaCategory | null = null;
  let bestScore = 0;
  // Iterate in rule order so a tie keeps the earlier rule.
  for (const rule of rules) {
    const s = scores.get(rule.category) ?? 0;
    if (s > bestScore) { best = rule.category; bestScore = s; }
  }
  return best;
}
