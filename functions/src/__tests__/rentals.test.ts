import { decodeEntities, stripHtml, truncate } from '../rentals/text';
import { KEYWORD_RULES, suggestCategory, tokenize, wordForms } from '../rentals/keywords';
import { resolveCategory, isVisible } from '../rentals/resolve';
import { mapWooProduct, toMajorUnits, productsUrl, contentHash, isOnHost, fetchAllProducts, type WooProduct } from '../rentals/woo';
import { withUtm } from '../rentals/links';
import { goneFromStore, isMassRemoval } from '../rentals/removal';

const HOST = 'xn--6dbfboov3a.xn--4dbrk0ce';

function product(over: Partial<WooProduct> = {}): WooProduct {
  return {
    id: 11197,
    name: 'מוניטור אלחוטי מקליט &quot;Accsoon CineView M7 Pro 7',
    permalink: `https://${HOST}/ציוד/monitor/`,
    short_description: '',
    description: '<h1><strong>Accsoon &#8211; מוניטור</strong></h1><p>שורה&nbsp;שנייה</p>',
    on_sale: false,
    prices: { price: '200', regular_price: '200', sale_price: '200', currency_code: 'ILS', currency_minor_unit: 0 },
    images: [{ src: 'https://x/a.webp' }, { src: 'https://x/b.webp' }, { src: 'https://x/c.webp' }],
    categories: [{ id: 18, name: 'ציוד תאורה להשכרה', slug: 'x' }],
    is_in_stock: true,
    ...over,
  };
}

describe('text', () => {
  it('decodes the entities the test store actually sends', () => {
    expect(decodeEntities('&quot;Accsoon&quot; 1&#215;4&#8242; &#8211; A&amp;B &#x2032;')).toBe('"Accsoon" 1×4′ – A&B ′');
  });
  it('drops invalid code points instead of throwing', () => {
    expect(decodeEntities('a&#0;b&#xD800;c&#99999999;d')).toBe('abcd');
  });
  it('strips HTML to text with line breaks', () => {
    expect(stripHtml('<h1>Title</h1><p>one&nbsp;two</p><script>x()</script>')).toBe('Title\none two');
  });
  it('truncates at a word with an ellipsis', () => {
    const out = truncate('alpha beta gamma delta', 15);
    expect(out.length).toBeLessThanOrEqual(15);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('prices', () => {
  it('reads whole shekels when currency_minor_unit is 0 (never /100)', () => {
    expect(toMajorUnits('200', 0)).toBe(200);
  });
  it('divides by 10^minor_unit when the store uses cents', () => {
    expect(toMajorUnits('20000', 2)).toBe(200);
  });
  it('rejects garbage', () => {
    expect(toMajorUnits('', 0)).toBeNull();
    expect(toMajorUnits('abc', 0)).toBeNull();
    expect(toMajorUnits('-5', 0)).toBeNull();
  });
});

describe('mapWooProduct', () => {
  it('maps the real test-store shape', () => {
    const m = mapWooProduct(product(), HOST)!;
    expect(m.name).toBe('מוניטור אלחוטי מקליט "Accsoon CineView M7 Pro 7');
    expect(m.pricePerDay).toBe(200);
    expect(m.salePrice).toBeNull(); // sale_price == regular_price on every real item
    expect(m.imageSources).toEqual(['https://x/a.webp', 'https://x/b.webp']); // max 2
    expect(m.externalCategories).toEqual(['ציוד תאורה להשכרה']);
    expect(m.description).toBe('Accsoon – מוניטור\nשורה שנייה');
  });
  it('prefers short_description and caps it at 500 chars', () => {
    const m = mapWooProduct(product({ short_description: `<p>${'מילה '.repeat(300)}</p>` }), HOST)!;
    expect(m.description.length).toBeLessThanOrEqual(500);
    expect(m.description.startsWith('מילה')).toBe(true);
  });
  it('price 0 is "price on request" (null), never ₪0', () => {
    const m = mapWooProduct(product({ prices: { ...product().prices, price: '0', regular_price: '0', sale_price: '0' } }), HOST)!;
    expect(m.pricePerDay).toBeNull();
    expect(m.salePrice).toBeNull();
  });
  it('salePrice only when on_sale AND lower', () => {
    const p = { ...product().prices, sale_price: '150' };
    expect(mapWooProduct(product({ prices: p, on_sale: true }), HOST)!.salePrice).toBe(150);
    expect(mapWooProduct(product({ prices: p, on_sale: false }), HOST)!.salePrice).toBeNull();
    expect(mapWooProduct(product({ prices: { ...p, sale_price: '250' }, on_sale: true }), HOST)!.salePrice).toBeNull();
  });
  it('drops a product whose link leaves the store', () => {
    expect(mapWooProduct(product({ permalink: 'https://evil.example/x' }), HOST)).toBeNull();
    expect(mapWooProduct(product({ permalink: 'javascript:alert(1)' }), HOST)).toBeNull();
    expect(isOnHost(`https://www.${HOST}/p`, HOST)).toBe(true);
  });
  it('the content hash changes with content and only with content', () => {
    const a = mapWooProduct(product(), HOST)!;
    expect(contentHash(a)).toBe(contentHash(mapWooProduct(product(), HOST)!));
    expect(contentHash(a)).not.toBe(contentHash({ ...a, pricePerDay: 201 }));
  });
});

describe('productsUrl', () => {
  it('builds the Store API URL from a bare site or a full API URL', () => {
    expect(productsUrl('https://lens4rent.biz/', 2)).toBe('https://lens4rent.biz/wp-json/wc/store/v1/products?per_page=100&page=2');
    expect(productsUrl('https://lens4rent.biz/wp-json/wc/store/v1/products?per_page=100&page=1', 1))
      .toBe('https://lens4rent.biz/wp-json/wc/store/v1/products?per_page=100&page=1');
  });
});

describe('fetchAllProducts', () => {
  it('pages using X-WP-TotalPages', async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      const page = Number(new URL(url).searchParams.get('page'));
      return new Response(JSON.stringify([product({ id: page })]), { headers: { 'x-wp-totalpages': '3' } });
    }) as unknown as typeof fetch;
    const all = await fetchAllProducts('https://lens4rent.biz', fake);
    expect(all.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(calls).toHaveLength(3);
  });
});

describe('keywords', () => {
  it('tokenizes Hebrew with geresh and quote marks', () => {
    expect(tokenize("ג'אמפר SDI 100מ\"מ")).toEqual(['גאמפר', 'sdi', '100ממ']);
  });
  it('accepts up to two Hebrew prefixes, keeping two letters', () => {
    expect(wordForms('ולפנסים')).toEqual(['ולפנסים', 'לפנסים', 'פנסים']);
    expect(wordForms('לד')).toEqual(['לד']);
  });
  it.each([
    ['עדשה לסוני SONY 35mm f/1.4 GM', 'lens'],
    ['מיקרופון rode ntg 4 plus', 'audio'],
    ['מקליט סאונד ZOOM H6', 'audio'],
    ['פנס לד Aputure STORM 1200x', 'lighting'],
    ['גימבל למצלמה DJI RS4', 'grip'],
    ['מצלמה Sony FX3', 'camera'],
    ['מוניטור במאי ATOMOS SUMO 19 SE', 'accessories'],
  ])('%s → %s', (name, cat) => {
    expect(suggestCategory(name)).toBe(cat);
  });
  it('never suggests Studios or Production (BAMA Market categories only)', () => {
    for (const name of ['סט 4 מכשירי קשר', 'רקע נייר', 'גנרטור מושתק', 'מכונת עשן', 'מסך ירוק']) {
      expect(['studio', 'production']).not.toContain(suggestCategory(name));
    }
    expect(KEYWORD_RULES.map((r) => r.category)).toEqual(['camera', 'drone', 'audio', 'lighting', 'lens', 'accessories', 'grip']);
  });

  it('has no bare "mm" rule and never matches inside a word', () => {
    expect(suggestCategory('Rod 15mm זוג מוטות')).toBe('lens'); // a focal-length-shaped token is a lens hint…
    expect(suggestCategory('שק mm')).toBeNull();               // …but "mm" alone is nothing
    expect(suggestCategory('Microlenses')).toBeNull();          // and "lens" inside a word is nothing
  });
  it('a phrase outweighs a single word', () => {
    expect(suggestCategory('Zoom lens 24-70')).toBe('lens');
  });
});

describe('resolveCategory', () => {
  const map = { 'ציוד תאורה להשכרה': 'lighting', 'חומרי גלם': 'hidden', 'בלגן': 'not-a-category' };
  it('manual beats the map', () => {
    expect(resolveCategory({ manualCategory: 'grip', externalCategories: ['ציוד תאורה להשכרה'], categoryMap: map })).toBe('grip');
  });
  it('uses the first external category that has a valid mapping', () => {
    expect(resolveCategory({ externalCategories: ['בלגן', 'מבצעים', 'ציוד תאורה להשכרה'], categoryMap: map })).toBe('lighting');
  });
  it('a mapping or admin choice to Studios or Production is not a rental category: unsorted', () => {
    expect(resolveCategory({ externalCategories: ['הפקה'], categoryMap: { 'הפקה': 'production' } })).toBe('unsorted');
    expect(resolveCategory({ manualCategory: 'studio', externalCategories: [], categoryMap: null })).toBe('unsorted');
  });

  it('maps to hidden', () => {
    expect(resolveCategory({ externalCategories: ['חומרי גלם'], categoryMap: map })).toBe('hidden');
  });
  it('is unsorted otherwise — a keyword guess is never applied', () => {
    expect(resolveCategory({ externalCategories: [], categoryMap: map })).toBe('unsorted');
    expect(resolveCategory({ manualCategory: 'unsorted', externalCategories: [], categoryMap: null })).toBe('unsorted');
  });
  it('visibility needs an active company, an active item and a real category', () => {
    const base = { companyActive: true, companyRemoved: false, itemActive: true, category: 'lens' };
    expect(isVisible(base)).toBe(true);
    expect(isVisible({ ...base, companyActive: false })).toBe(false);
    expect(isVisible({ ...base, companyRemoved: true })).toBe(false);
    expect(isVisible({ ...base, itemActive: false })).toBe(false);
    expect(isVisible({ ...base, category: 'unsorted' })).toBe(false);
    expect(isVisible({ ...base, category: 'hidden' })).toBe(false);
  });
});

describe('withUtm', () => {
  it('adds utm_source=bama, keeping existing params and the hash', () => {
    expect(withUtm('https://s.co/p/?a=1#x')).toBe('https://s.co/p/?a=1&utm_source=bama#x');
    expect(withUtm('https://s.co/p/')).toBe('https://s.co/p/?utm_source=bama');
  });
  it('does not duplicate it', () => {
    expect(withUtm('https://s.co/p/?utm_source=bama')).toBe('https://s.co/p/?utm_source=bama');
  });
});

describe('goneFromStore (removal detection — by this sync’s ids, not lastSeenAt)', () => {
  const live = { active: true, visible: true };
  const existing = new Map([
    ['co_1', live],
    ['co_2', live],
    ['co_3', { active: true, visible: false }],   // active but hidden (e.g. unsorted)
    ['co_9', { active: false, visible: false }],  // already gone in an earlier sync
  ]);
  it('one product missing from the store → exactly that item', () => {
    expect(goneFromStore(existing, new Set(['co_1', 'co_3']))).toEqual(['co_2']);
  });
  it('an active-but-hidden item that disappears is deactivated too', () => {
    expect(goneFromStore(existing, new Set(['co_1', 'co_2']))).toEqual(['co_3']);
  });
  it('an already-inactive missing item is not written again', () => {
    expect(goneFromStore(existing, new Set(['co_1', 'co_2', 'co_3']))).toEqual([]);
  });
  it('an empty store response deactivates everything still live', () => {
    expect(goneFromStore(existing, new Set())).toEqual(['co_1', 'co_2', 'co_3']);
  });
});

describe('isMassRemoval', () => {
  it('stops a sync that would hide more than half of the live items', () => {
    expect(isMassRemoval(324, 324)).toBe(true); // store answered empty
    expect(isMassRemoval(163, 324)).toBe(true);
    expect(isMassRemoval(162, 324)).toBe(false);
    expect(isMassRemoval(1, 324)).toBe(false);  // one product gone: normal
  });
  it('does not apply to tiny catalogues', () => {
    expect(isMassRemoval(5, 9)).toBe(false);
  });
});
