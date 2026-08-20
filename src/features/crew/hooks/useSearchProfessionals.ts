import { useState, useEffect } from 'react';
import { queryDocuments, getDocument, queryByField } from '@core/firebase/firestore';
import type { User } from '@core/types/user';
import type { ProfessionalProfile } from '@core/types/user';
import type { Review } from '@core/types/project';
import { computeAverageRating } from '@features/reviews/utils/rating';

export type ProfessionalResult = {
  user: User;
  profile: ProfessionalProfile;
};

export function useSearchProfessionals(category: string, subcategory?: string) {
  const [results, setResults] = useState<ProfessionalResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  void subcategory; // subcategory no longer stored on skills — kept as param for API compat

  useEffect(() => {
    if (!category) {
      setResults([]);
      setIsLoading(false);
      return;
    }

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
          const hasSkill = profile.skills.some(s => s.category === category);
          if (!hasSkill) return;
          const reviews = await queryByField<Review>('reviews', 'professionalId', user.id).catch(() => [] as Review[]);
          const { average, count } = computeAverageRating(reviews);
          matches.push({ user, profile: { ...profile, rating: average, reviewCount: count } });
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
  }, [category]);

  return { results, isLoading };
}
