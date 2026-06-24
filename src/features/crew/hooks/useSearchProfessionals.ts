import { useState, useEffect } from 'react';
import { queryDocuments, getDocument } from '@core/firebase/firestore';
import type { User } from '@core/types/user';
import type { ProfessionalProfile } from '@core/types/user';

export type ProfessionalResult = {
  user: User;
  profile: ProfessionalProfile;
};

export function useSearchProfessionals(category: string, subcategory: string) {
  const [results, setResults] = useState<ProfessionalResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setResults([]);

    async function run() {
      const users = await queryDocuments<User>('users');
      const matches: ProfessionalResult[] = [];

      await Promise.all(
        users.map(async (user) => {
          const profile = await getDocument<ProfessionalProfile>(
            `users/${user.id}/profile/data`
          );
          if (!profile?.skills) return;
          const hasSkill = profile.skills.some(
            (s) =>
              s.category === category && s.subcategory === subcategory
          );
          if (hasSkill) matches.push({ user, profile });
        })
      );

      if (!cancelled) {
        setResults(matches);
        setIsLoading(false);
      }
    }

    run().catch(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [category, subcategory]);

  return { results, isLoading };
}
