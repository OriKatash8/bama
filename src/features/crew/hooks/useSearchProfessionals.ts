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
    if (!category || !subcategory) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setResults([]);

    async function run() {
      const users = await queryDocuments<User>('users');
      console.log('[useSearchProfessionals] fetched users:', users.length, users.map(u => u.id));
      const matches: ProfessionalResult[] = [];

      await Promise.all(
        users.map(async (user) => {
          const profile = await getDocument<ProfessionalProfile>(
            `users/${user.id}/profile/data`
          );
          console.log(`[useSearchProfessionals] user ${user.id} profile/data:`, profile ?? 'NOT FOUND');
          if (!profile?.skills) return;
          const hasSkill = profile.skills.some(
            (s) =>
              s.category === category && s.subcategory === subcategory
          );
          if (user.id === 'ujLxN40kiFaYpr6SdHADMhjNEXD2') {
            console.log(`[useSearchProfessionals] SEARCHING FOR category="${category}" subcategory="${subcategory}"`);
            console.log(`[useSearchProfessionals] skills for ${user.id}:`, JSON.stringify(profile.skills, null, 2));
          }
          console.log(`[useSearchProfessionals] user ${user.id} hasSkill (${category} / ${subcategory}):`, hasSkill, 'skills:', profile.skills);
          if (hasSkill) matches.push({ user, profile });
        })
      );

      console.log('[useSearchProfessionals] final matches:', matches.length, matches);
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
