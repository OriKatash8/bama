import { UTM_PARAMS } from './config';

/**
 * The outbound link users open, with BAMA's UTM params. Built once here, at
 * sync time, and stored on the item as `linkUrl`, so the app never assembles
 * URLs itself. Existing params and the #hash are kept; a param already present
 * is not duplicated.
 */
export function withUtm(url: string, params: Record<string, string> = UTM_PARAMS): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) {
    if (!u.searchParams.has(k)) u.searchParams.append(k, v);
  }
  return u.toString();
}
