import {
  collection,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type Firestore,
  type Query,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import type { Clause, QuerySpec } from './querySpecs';

function toConstraint(c: Clause): QueryConstraint {
  switch (c.kind) {
    case 'where': return where(c.field, c.op, c.value);
    case 'orderBy': return orderBy(c.field, c.dir);
    case 'limit': return limit(c.n);
  }
}

/**
 * A spec from querySpecs.ts as a Firestore query; `after` continues a page
 * ("load more"). The cursor goes before the limit, as Firestore requires.
 */
export function toQuery(db: Firestore, spec: QuerySpec, after?: QueryDocumentSnapshot | null): Query {
  const constraints = spec.clauses.map(toConstraint);
  if (after) {
    const at = spec.clauses.findIndex((c) => c.kind === 'limit');
    constraints.splice(at < 0 ? constraints.length : at, 0, startAfter(after));
  }
  return query(collection(db, spec.collection), ...constraints);
}
