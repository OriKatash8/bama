import { httpsCallable } from 'firebase/functions';
import { functions, functionsEU } from './config';

export type FunctionsRegion = 'europe-west1';

export function callFunction<TData, TResult>(
  name: string,
  region?: FunctionsRegion,
): (data: TData) => Promise<TResult> {
  const fn = httpsCallable<TData, TResult>(region === 'europe-west1' ? functionsEU : functions, name);
  return async (data: TData) => {
    const result = await fn(data);
    return result.data;
  };
}
