/**
 * An in-memory stand-in for lifecycle/helpers' Firestore surface, with
 * OPTIMISTIC transactions: a transaction commits only if everything it read is
 * unchanged, otherwise it re-runs, as Firestore does. That is what makes the
 * concurrent-claim tests meaningful rather than accidentally serial.
 */
type Doc = Record<string, any>;
const FV = Symbol('fieldvalue');

export class Ts {
  constructor(public ms: number) {}
  toMillis() { return this.ms; }
}
export const Timestamp = {
  now: () => new Ts(Date.now()),
  fromMillis: (ms: number) => new Ts(ms),
};
export const FieldValue = {
  serverTimestamp: () => ({ [FV]: 'ts' }),
  increment: (n: number) => ({ [FV]: 'inc', n }),
  delete: () => ({ [FV]: 'del' }),
};

function resolve(existing: unknown, v: any): any {
  if (v && typeof v === 'object' && FV in v) {
    switch (v[FV]) {
      case 'ts': return new Ts(Date.now());
      case 'inc': return ((existing as number) ?? 0) + v.n;
      case 'del': return undefined;
    }
  }
  return v;
}
function applyPatch(base: Doc | undefined, patch: Doc, replace: boolean): Doc {
  const out: Doc = replace ? {} : { ...(base ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    const r = resolve(base?.[k], v);
    if (r === undefined) delete out[k]; else out[k] = r;
  }
  return out;
}

export class MemoryDb {
  data = new Map<string, Doc>();
  versions = new Map<string, number>();
  /** Yield between a transaction's read and its commit so racers interleave. */
  yieldOnRead = true;

  reset() { this.data.clear(); this.versions.clear(); }
  seed(path: string, doc: Doc) { this.data.set(path, doc); this.versions.set(path, (this.versions.get(path) ?? 0) + 1); }
  read(path: string): Doc | undefined { const d = this.data.get(path); return d ? { ...d } : undefined; }

  private commit(writes: { path: string; kind: 'set' | 'update' | 'create' | 'delete'; data?: Doc; merge?: boolean }[]) {
    for (const w of writes) {
      const cur = this.data.get(w.path);
      if (w.kind === 'delete') this.data.delete(w.path);
      else if (w.kind === 'create') {
        if (cur) throw Object.assign(new Error('already-exists'), { code: 6 });
        this.data.set(w.path, applyPatch(undefined, w.data!, true));
      } else if (w.kind === 'update') {
        if (!cur) throw Object.assign(new Error('not-found'), { code: 5 });
        this.data.set(w.path, applyPatch(cur, w.data!, false));
      } else this.data.set(w.path, applyPatch(cur, w.data!, !w.merge));
      this.versions.set(w.path, (this.versions.get(w.path) ?? 0) + 1);
    }
  }

  snap(path: string) {
    const d = this.data.get(path);
    return {
      exists: !!d, id: path.split('/').pop()!, ref: this.doc(path),
      data: () => (d ? { ...d } : undefined),
      get: (f: string) => d?.[f],
    };
  }

  doc = (path: string): any => ({
    path, id: path.split('/').pop(),
    get: async () => this.snap(path),
    set: async (data: Doc, o?: { merge?: boolean }) => this.commit([{ path, kind: 'set', data, merge: o?.merge }]),
    update: async (data: Doc) => this.commit([{ path, kind: 'update', data }]),
    create: async (data: Doc) => this.commit([{ path, kind: 'create', data }]),
    delete: async () => this.commit([{ path, kind: 'delete' }]),
  });

  collection = (name: string): any => ({
    doc: (id: string) => this.doc(`${name}/${id}`),
  });

  collectionGroup = (name: string): any => {
    const filters: [string, any][] = [];
    const q: any = {
      where: (f: string, _op: string, v: any) => { filters.push([f, v]); return q; },
      orderBy: () => q, limit: () => q, startAfter: () => q,
      get: async () => {
        const docs = [...this.data.keys()]
          .filter((p) => p.split('/').slice(-2)[0] === name && p.split('/').length % 2 === 0)
          .filter((p) => filters.every(([f, v]) => this.data.get(p)![f] === v))
          .map((p) => ({ ...this.snap(p), ref: this.doc(p) }));
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
    return q;
  };

  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const reads = new Map<string, number>();
      const writes: any[] = [];
      const tx = {
        get: async (ref: any) => {
          reads.set(ref.path, this.versions.get(ref.path) ?? 0);
          if (this.yieldOnRead) await new Promise((r) => setImmediate(r));
          return this.snap(ref.path);
        },
        set: (ref: any, data: Doc, o?: { merge?: boolean }) => writes.push({ path: ref.path, kind: 'set', data, merge: o?.merge }),
        update: (ref: any, data: Doc) => writes.push({ path: ref.path, kind: 'update', data }),
        create: (ref: any, data: Doc) => writes.push({ path: ref.path, kind: 'create', data }),
        delete: (ref: any) => writes.push({ path: ref.path, kind: 'delete' }),
      };
      const result = await fn(tx);
      const clean = [...reads].every(([p, v]) => (this.versions.get(p) ?? 0) === v);
      if (clean) { this.commit(writes); return result; }
    }
    throw new Error('transaction contention');
  }
}

export const mockDb = new MemoryDb();
export const mockHelpers = {
  db: mockDb,
  FieldValue,
  Timestamp,
  requireAuth: (u: string) => u,
  feeRef: (p: string, u: string) => mockDb.doc(`projects/${p}/fees/${u}`),
  feesCol: (p: string) => mockDb.collection(`projects/${p}/fees`),
  contestWindowEndsAt: (f: any) => f.chargeDueAt ?? f.disputeWindowEndsAt,
  notify: async () => undefined,
};
