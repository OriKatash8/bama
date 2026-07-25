import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@core/firebase/config';

export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      console.log('[useIsAdmin] onAuthStateChanged uid:', user?.uid ?? 'null');
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      user.getIdToken(true)
        .then(() => user.getIdTokenResult())
        .then((result) => {
          console.log('[useIsAdmin] full token claims:', JSON.stringify(result.claims));
          const admin = result.claims['role'] === 'admin';
          console.log('[useIsAdmin] role === admin:', admin);
          setIsAdmin(admin);
        })
        .catch((err) => {
          console.log('[useIsAdmin] error getting token:', err);
          setIsAdmin(false);
        })
        .finally(() => setLoading(false));
    });
    return unsub;
  }, []);

  return { isAdmin, loading };
}
