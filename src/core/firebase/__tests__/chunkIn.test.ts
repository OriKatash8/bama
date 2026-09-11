import { chunkIn, mergeById, IN_CHUNK_SIZE } from '../chunkIn';

describe('chunkIn — the 20-document rules budget', () => {
  it('stays under the budget that actually denied the query', () => {
    // Measured in production: an `in` list of 20 ids was allowed, 26 denied.
    // Whatever else changes, the chunk must not approach that.
    expect(IN_CHUNK_SIZE).toBeLessThan(20);
  });

  it('splits a list that used to be sent whole', () => {
    // 22 is the real number: the client who lost their offers page owned 22
    // projects, and all 22 ids went out in one `in`.
    const ids = Array.from({ length: 22 }, (_, i) => `p${i}`);
    const chunks = chunkIn(ids);
    expect(chunks).toHaveLength(3);
    expect(chunks.map((c) => c.length)).toEqual([10, 10, 2]);
    expect(chunks.flat()).toEqual(ids); // nothing dropped, order preserved
  });

  it('loses nothing at the exact chunk boundary', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `p${i}`);
    expect(chunkIn(ids).map((c) => c.length)).toEqual([10, 10]);
    expect(chunkIn(ids).flat()).toEqual(ids);
  });

  it('passes a short list through as one chunk', () => {
    expect(chunkIn(['a', 'b'])).toEqual([['a', 'b']]);
  });

  it('returns nothing for an empty list rather than one empty query', () => {
    // An `in` with an empty array is an invalid-argument error at the SDK.
    expect(chunkIn([])).toEqual([]);
  });

  it('refuses a size that would loop forever', () => {
    expect(() => chunkIn(['a'], 0)).toThrow();
  });
});

describe('mergeById', () => {
  it('flattens the buckets', () => {
    expect(mergeById([[{ id: 'a' }], [{ id: 'b' }]])).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('collapses a document that appeared in two chunks', () => {
    // A caller's id list is not guaranteed unique; without keying, a repeated
    // project id would render the same offer twice.
    const merged = mergeById([[{ id: 'a', v: 1 }], [{ id: 'a', v: 2 }]]);
    expect(merged).toHaveLength(1);
    expect(merged[0].v).toBe(2); // last write wins
  });

  it('handles empty and partially-empty buckets', () => {
    expect(mergeById([])).toEqual([]);
    expect(mergeById([[], [{ id: 'a' }], []])).toEqual([{ id: 'a' }]);
  });
});
