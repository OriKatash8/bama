import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

export function callFunction<TData, TResult>(
  name: string
): (data: TData) => Promise<TResult> {
  const fn = httpsCallable<TData, TResult>(functions, name);
  return async (data: TData) => {
    const result = await fn(data);
    return result.data;
  };
}
