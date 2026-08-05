import { useState, useEffect } from 'react';
import { queryDocuments, getDocument } from '@core/firebase/firestore';
import type { User } from '@core/types/user';
import type { ProfessionalProfile } from '@core/types/user';
import type { ProfessionalResult } from './useSearchProfessionals';

type MatchPriority = 0 | 1; // 0=name, 1=category

type RankedResult = ProfessionalResult & { priority: MatchPriority };

export function useUnifiedSearch(query: string): { results: ProfessionalResult[]; isLoading: boolean } {
  const [results, setResults] = useState<ProfessionalResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setResults([]);
    setIsLoading(true);

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const users = await queryDocuments<User>('users');
          const ranked: RankedResult[] = [];

          await Promise.all(
            users.map(async (user) => {
              const profile = await getDocument<ProfessionalProfile>(
                `users/${user.id}/profile/data`
              );
              if (!profile?.skills?.length) return;

              const nameMatch = (user.displayName ?? '').toLowerCase().includes(trimmed);
              const categoryMatch = profile.skills.some((s) =>
                s.category.toLowerCase().includes(trimmed)
              );

              if (!nameMatch && !categoryMatch) return;

              const priority: MatchPriority = nameMatch ? 0 : 1;
              ranked.push({ user, profile, priority });
            })
          );

          ranked.sort((a, b) => a.priority - b.priority);

          if (!cancelled) {
            setResults(ranked.map(({ user, profile }) => ({ user, profile })));
            setIsLoading(false);
          }
        } catch {
          if (!cancelled) setIsLoading(false);
        }
      })();
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return { results, isLoading };
}
