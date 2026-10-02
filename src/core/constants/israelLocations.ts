// The one list of Israeli locations, used by every city picker (home builder,
// direct-project sheet, marketplace listing/rental sheet, project details) and
// by every place that shows a saved location.
//
// Each place is one entry with both names. A picker shows the names in the
// current language; a saved value — stored in whatever language it was picked
// in — is shown translated to the current language. Free-typed text that is not
// on the list is shown as typed.

export type AppLanguage = 'he' | 'en';

type IsraelLocation = {
  he: string;
  en: string;
  /** Other spellings a saved value may carry (matched, never shown). */
  aliases?: readonly string[];
};

export const ISRAEL_LOCATIONS: readonly IsraelLocation[] = [
  // Cities
  { he: 'תל אביב', en: 'Tel Aviv', aliases: ['Tel Aviv-Yafo', 'תל אביב-יפו', 'תל אביב יפו'] },
  { he: 'ירושלים', en: 'Jerusalem' },
  { he: 'חיפה', en: 'Haifa' },
  { he: 'ראשון לציון', en: 'Rishon LeZion' },
  { he: 'פתח תקווה', en: 'Petah Tikva', aliases: ['פתח תקוה'] },
  { he: 'אשדוד', en: 'Ashdod' },
  { he: 'נתניה', en: 'Netanya' },
  { he: 'באר שבע', en: 'Beer Sheva', aliases: ['Beersheba', "Be'er Sheva"] },
  { he: 'בני ברק', en: 'Bnei Brak' },
  { he: 'רמת גן', en: 'Ramat Gan' },
  { he: 'בת ים', en: 'Bat Yam' },
  { he: 'הרצליה', en: 'Herzliya' },
  { he: 'כפר סבא', en: 'Kfar Saba' },
  { he: 'חולון', en: 'Holon' },
  { he: 'רעננה', en: 'Raanana', aliases: ["Ra'anana"] },
  { he: 'מודיעין', en: "Modi'in", aliases: ['Modiin'] },
  { he: 'מודיעין מכבים רעות', en: "Modi'in Maccabim Re'ut", aliases: ["Modiin Maccabim Re'ut"] },
  { he: 'רחובות', en: 'Rehovot' },
  { he: 'אשקלון', en: 'Ashkelon' },
  { he: 'הוד השרון', en: 'Hod HaSharon' },
  { he: 'רמת השרון', en: 'Ramat HaSharon' },
  { he: 'גבעתיים', en: 'Givatayim' },
  { he: 'עכו', en: 'Acre', aliases: ['Akko'] },
  { he: 'נהריה', en: 'Nahariya' },
  { he: 'טבריה', en: 'Tiberias' },
  { he: 'צפת', en: 'Safed', aliases: ['Tzfat'] },
  { he: 'לוד', en: 'Lod' },
  { he: 'רמלה', en: 'Ramla' },
  { he: 'אילת', en: 'Eilat' },
  { he: 'נצרת', en: 'Nazareth' },
  { he: 'חדרה', en: 'Hadera' },
  { he: 'קדימה צורן', en: 'Kadima Zoran' },
  { he: 'כפר יונה', en: 'Kfar Yona' },
  { he: 'נשר', en: 'Nesher' },
  { he: 'קרית ביאליק', en: 'Kiryat Bialik' },
  { he: 'קרית מוצקין', en: 'Kiryat Motzkin' },
  { he: 'קרית ים', en: 'Kiryat Yam' },
  { he: 'קרית אתא', en: 'Kiryat Ata' },
  { he: 'קרית גת', en: 'Kiryat Gat' },
  { he: 'קרית שמונה', en: 'Kiryat Shmona' },
  { he: 'קרית מלאכי', en: 'Kiryat Malakhi' },
  { he: 'עפולה', en: 'Afula' },
  { he: 'בית שאן', en: 'Beit Shean' },
  { he: 'מגדל העמק', en: 'Migdal HaEmek' },
  { he: 'יוקנעם', en: 'Yokneam', aliases: ['יקנעם'] },
  { he: 'זכרון יעקב', en: 'Zichron Yaakov' },
  { he: 'פרדס חנה', en: 'Pardes Hanna', aliases: ['Pardes Hana', 'פרדס חנה כרכור'] },
  { he: 'בנימינה', en: 'Binyamina' },
  { he: 'קיסריה', en: 'Caesarea' },
  { he: 'טירת כרמל', en: 'Tirat Carmel' },
  { he: 'גדרה', en: 'Gadera', aliases: ['Gedera'] },
  { he: 'נס ציונה', en: 'Nes Ziona', aliases: ['Ness Ziona'] },
  { he: 'יבנה', en: 'Yavne' },
  { he: 'גן יבנה', en: 'Gan Yavne' },
  { he: 'באר יעקב', en: 'Beer Yaakov' },
  { he: 'אבן יהודה', en: 'Even Yehuda' },
  { he: 'תל מונד', en: 'Tel Mond' },
  { he: 'יהוד', en: 'Yehud' },
  { he: 'אור יהודה', en: 'Or Yehuda' },
  { he: 'אזור', en: 'Azor' },
  { he: 'נתיבות', en: 'Netivot' },
  { he: 'שדרות', en: 'Sderot' },
  { he: 'אופקים', en: 'Ofakim' },
  { he: 'דימונה', en: 'Dimona' },
  { he: 'ערד', en: 'Arad' },
  { he: 'מעלה אדומים', en: 'Maale Adumim' },
  { he: 'מבשרת ציון', en: 'Mevaseret Zion', aliases: ['Mevasseret Zion'] },
  { he: 'בית שמש', en: 'Beit Shemesh' },
  { he: 'אריאל', en: 'Ariel' },
  { he: 'שוהם', en: 'Shoham' },
  { he: 'ראש העין', en: 'Rosh HaAyin' },
  { he: 'מעלות תרשיחא', en: "Ma'alot-Tarshiha", aliases: ['Maalot Tarshiha'] },
  // Kibbutzim and villages
  { he: 'כפר עזה', en: 'Kfar Aza' },
  { he: 'בארי', en: "Be'eri", aliases: ['Beeri'] },
  { he: 'נחל עוז', en: 'Nahal Oz' },
  { he: 'רעים', en: "Re'im", aliases: ['Reim'] },
  { he: 'דגניה', en: 'Degania' },
  { he: 'עין חרוד', en: 'Ein Harod' },
  { he: 'מרחביה', en: 'Merhavia' },
  { he: 'גינוסר', en: 'Ginosar' },
  { he: 'לביא', en: 'Lavi' },
  // Regions
  { he: 'גוש דן', en: 'Gush Dan' },
  { he: 'שפלה', en: 'Shephelah' },
  { he: 'צפון', en: 'North' },
  { he: 'דרום', en: 'South' },
  { he: 'מרכז', en: 'Center' },
  { he: 'שרון', en: 'Sharon' },
  { he: 'גליל', en: 'Galilee' },
  { he: 'נגב', en: 'Negev' },
  { he: 'ירושלים והסביבה', en: 'Jerusalem Area' },
  { he: 'עמק יזרעאל', en: 'Jezreel Valley' },
  { he: 'הכרמל', en: 'Carmel' },
  { he: 'הגולן', en: 'Golan' },
  { he: 'עמק הירדן', en: 'Jordan Valley' },
  { he: 'ערבה', en: 'Arava' },
  { he: 'אילת והסביבה', en: 'Eilat Area' },
];

const norm = (s: string) => s.trim().toLowerCase();

const BY_NAME = new Map<string, IsraelLocation>();
for (const loc of ISRAEL_LOCATIONS) {
  for (const name of [loc.he, loc.en, ...(loc.aliases ?? [])]) BY_NAME.set(norm(name), loc);
}

/** The list entry a saved value names, in either language; undefined if free text. */
export function findLocation(value: string | null | undefined): IsraelLocation | undefined {
  if (!value) return undefined;
  return BY_NAME.get(norm(value));
}

/**
 * A saved location in the current language. A list place is translated; free
 * text is returned as typed. A "City, rest" value translates its city part.
 */
export function localizeLocation(value: string | null | undefined, language: AppLanguage): string {
  if (!value) return '';
  const whole = findLocation(value);
  if (whole) return whole[language];
  const comma = value.indexOf(',');
  if (comma > 0) {
    const head = findLocation(value.slice(0, comma));
    if (head) return `${head[language]}${value.slice(comma)}`;
  }
  return value;
}

/**
 * The picker's rows: every place's name in the current language, filtered by a
 * query that may be typed in either language ("Haifa" finds חיפה in Hebrew).
 */
export function searchLocations(query: string, language: AppLanguage): string[] {
  const q = norm(query);
  const hits = q
    ? ISRAEL_LOCATIONS.filter((loc) =>
        [loc.he, loc.en, ...(loc.aliases ?? [])].some((n) => n.toLowerCase().includes(q)))
    : ISRAEL_LOCATIONS;
  return hits.map((loc) => loc[language]);
}

/** Whether two values name the same place (a list place in any language, or equal free text). */
export function sameLocation(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const la = findLocation(a);
  return la ? la === findLocation(b) : norm(a) === norm(b);
}
