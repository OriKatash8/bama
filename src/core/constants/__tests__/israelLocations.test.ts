import {
  ISRAEL_LOCATIONS, findLocation, localizeLocation, searchLocations, sameLocation,
} from '../israelLocations';

describe('israelLocations — one list, shown in the current language', () => {
  it('every place has both names, and no name belongs to two places', () => {
    const seen = new Map<string, string>();
    for (const loc of ISRAEL_LOCATIONS) {
      expect(loc.he.trim()).not.toBe('');
      expect(loc.en.trim()).not.toBe('');
      for (const n of [loc.he, loc.en, ...(loc.aliases ?? [])]) {
        const k = n.trim().toLowerCase();
        expect(seen.get(k) ?? loc.en).toBe(loc.en);
        seen.set(k, loc.en);
      }
    }
  });

  it('a value saved in Hebrew shows in English, and the other way round', () => {
    expect(localizeLocation('תל אביב', 'en')).toBe('Tel Aviv');
    expect(localizeLocation('Tel Aviv', 'he')).toBe('תל אביב');
    expect(localizeLocation('בארי', 'en')).toBe("Be'eri");
    expect(localizeLocation('tel aviv ', 'en')).toBe('Tel Aviv');
  });

  it('old spellings saved before the merge still translate', () => {
    expect(localizeLocation('Beersheba', 'he')).toBe('באר שבע');
    expect(localizeLocation('יקנעם', 'en')).toBe('Yokneam');
  });

  it('free text stays as typed; a "City, street" value translates its city', () => {
    expect(localizeLocation('Moshav Somewhere', 'he')).toBe('Moshav Somewhere');
    expect(localizeLocation('חיפה, הרצל 5', 'en')).toBe('Haifa, הרצל 5');
    expect(localizeLocation('', 'he')).toBe('');
    expect(localizeLocation(undefined, 'he')).toBe('');
  });

  it('the picker lists each place once, in the current language', () => {
    const heRows = searchLocations('', 'he');
    const enRows = searchLocations('', 'en');
    expect(heRows).toHaveLength(ISRAEL_LOCATIONS.length);
    expect(enRows).toHaveLength(ISRAEL_LOCATIONS.length);
    expect(heRows).toContain('חיפה');
    expect(heRows).not.toContain('Haifa');
    expect(enRows).toContain('Haifa');
    expect(enRows).not.toContain('חיפה');
  });

  it('a search typed in the other language still finds the place', () => {
    expect(searchLocations('haifa', 'he')).toEqual(['חיפה']);
    expect(searchLocations('חיפה', 'en')).toEqual(['Haifa']);
  });

  it('findLocation / sameLocation match a place across languages', () => {
    expect(findLocation('Haifa')).toBe(findLocation('חיפה'));
    expect(findLocation('nowhere')).toBeUndefined();
    expect(sameLocation('Haifa', 'חיפה')).toBe(true);
    expect(sameLocation('Haifa', 'Eilat')).toBe(false);
    expect(sameLocation('my place', 'My Place')).toBe(true);
  });
});
