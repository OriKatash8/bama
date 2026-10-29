import {
  rentalItemsSpec, partnerCompaniesSpec, adminCompaniesSpec, adminCompanyItemsSpec, searchKeyOf,
  NO_PRICE_SORT, RENTAL_PAGE_SIZE,
} from '../querySpecs';

/**
 * These specs are what the rules were probed with (scripts/probe-rental-rules.mjs)
 * and what firestore.indexes.json was written for. Changing one means re-running
 * the probe and checking the indexes — this test is the tripwire.
 */
const visible = { kind: 'where', field: 'visible', op: '==', value: true };

describe('rentalItemsSpec', () => {
  it('every user query on items starts with visible == true (the rules require it)', () => {
    for (const opts of [{}, { category: 'lens' }, { sort: 'price_asc' as const }, { sort: 'price_desc' as const }, { searchKey: 'apu' }]) {
      expect(rentalItemsSpec(opts).clauses[0]).toEqual(visible);
    }
  });

  it('default: by name, one page', () => {
    expect(rentalItemsSpec().clauses).toEqual([
      visible,
      { kind: 'orderBy', field: 'name', dir: 'asc' },
      { kind: 'limit', n: RENTAL_PAGE_SIZE },
    ]);
  });

  it('category + price low→high', () => {
    expect(rentalItemsSpec({ category: 'lens', sort: 'price_asc' }).clauses).toEqual([
      visible,
      { kind: 'where', field: 'category', op: '==', value: 'lens' },
      { kind: 'orderBy', field: 'sortPrice', dir: 'asc' },
      { kind: 'limit', n: RENTAL_PAGE_SIZE },
    ]);
  });

  it('price high→low leaves out "price on request"', () => {
    expect(rentalItemsSpec({ sort: 'price_desc' }).clauses).toEqual([
      visible,
      { kind: 'where', field: 'sortPrice', op: '<', value: NO_PRICE_SORT },
      { kind: 'orderBy', field: 'sortPrice', dir: 'desc' },
      { kind: 'limit', n: RENTAL_PAGE_SIZE },
    ]);
  });

  it('search is server-side on one key, ordered by name whatever the sort', () => {
    expect(rentalItemsSpec({ searchKey: 'aputure', sort: 'price_desc', category: 'lighting' }).clauses).toEqual([
      visible,
      { kind: 'where', field: 'category', op: '==', value: 'lighting' },
      { kind: 'where', field: 'searchKeys', op: 'array-contains', value: 'aputure' },
      { kind: 'orderBy', field: 'name', dir: 'asc' },
      { kind: 'limit', n: RENTAL_PAGE_SIZE },
    ]);
  });
});

describe('partner filter and brands', () => {
  it('a partner is an equality after visible, composable with category and price', () => {
    expect(rentalItemsSpec({ companyId: 'c1', category: 'lens', sort: 'price_desc' }).clauses).toEqual([
      visible,
      { kind: 'where', field: 'companyId', op: '==', value: 'c1' },
      { kind: 'where', field: 'category', op: '==', value: 'lens' },
      { kind: 'where', field: 'sortPrice', op: '<', value: NO_PRICE_SORT },
      { kind: 'orderBy', field: 'sortPrice', dir: 'desc' },
      { kind: 'limit', n: RENTAL_PAGE_SIZE },
    ]);
  });

  it('brands without search text go to the server as array-contains-any, ordered by name', () => {
    expect(rentalItemsSpec({ brandKeys: ['sony', 'aputure'], sort: 'price_asc' }).clauses).toEqual([
      visible,
      { kind: 'where', field: 'searchKeys', op: 'array-contains-any', value: ['sony', 'aputure'] },
      { kind: 'orderBy', field: 'name', dir: 'asc' },
      { kind: 'limit', n: RENTAL_PAGE_SIZE },
    ]);
  });

  it('with search text, the search key wins the one array clause (brands are matched on the loaded names)', () => {
    const clauses = rentalItemsSpec({ searchKey: 'monitor', brandKeys: ['atomos'] }).clauses;
    expect(clauses.filter((c) => c.kind === 'where' && c.field === 'searchKeys')).toEqual([
      { kind: 'where', field: 'searchKeys', op: 'array-contains', value: 'monitor' },
    ]);
  });

  it('caps brand keys at Firestore\'s 30', () => {
    const keys = Array.from({ length: 40 }, (_, i) => `b${i}`);
    const any = rentalItemsSpec({ brandKeys: keys }).clauses.find((c) => c.kind === 'where' && c.op === 'array-contains-any');
    expect(any && any.kind === 'where' && Array.isArray(any.value) ? any.value.length : 0).toBe(30);
  });
});

describe('company specs', () => {
  it('the partner row asks only for active companies', () => {
    expect(partnerCompaniesSpec().clauses[0]).toEqual({ kind: 'where', field: 'active', op: '==', value: true });
  });
  it('admin specs carry no visibility filter (admin claim only)', () => {
    expect(adminCompaniesSpec().clauses).toEqual([{ kind: 'orderBy', field: 'createdAt', dir: 'desc' }]);
    expect(adminCompanyItemsSpec('c1')).toEqual({
      collection: 'rentalItems', clauses: [{ kind: 'where', field: 'companyId', op: '==', value: 'c1' }],
    });
  });
});

describe('searchKeyOf', () => {
  it('takes the longest word, normalised like the sync', () => {
    expect(searchKeyOf('פנס Aputure')).toBe('aputure');
    expect(searchKeyOf("ג'אמפר")).toBe('גאמפר');
    expect(searchKeyOf('a')).toBeNull();
    expect(searchKeyOf('supercalifragilistic')).toBe('supercalifragil');
  });
});
