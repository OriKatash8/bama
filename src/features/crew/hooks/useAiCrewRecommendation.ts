import { useState } from 'react';
import { ROLE_CATEGORIES } from '../data/categories';
import { callClaudeAI } from '@core/services/aiService';
import type { CrewRequestSlot } from '@core/types/project';

type RecommendationResult = {
  explanation: string;
  slots: CrewRequestSlot[];
};

type Details = {
  title: string;
  description: string;
  exec: string;
  deadline: string;
  location: string;
  budget: string;
};

export type UseAiCrewRecommendationReturn = {
  recommend: (details: Details) => Promise<void>;
  result: RecommendationResult | null;
  isLoading: boolean;
  error: string | null;
  clear: () => void;
};

// The system prompt — including the allowed category list — and the token
// budget live server-side, in functions/src/claude/tasks.ts under
// 'crew-recommendation'. AI_ROLE_CATEGORIES there mirrors ROLE_CATEGORIES here
// and a test fails if the two diverge. ROLE_CATEGORIES is still imported below:
// it validates what comes BACK, which stays the client's job.

export function useAiCrewRecommendation(): UseAiCrewRecommendationReturn {
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function recommend(details: Details): Promise<void> {
    const userMessage = [
      details.title && `Title: ${details.title}`,
      details.description && `Description: ${details.description}`,
      details.exec && `Execution: ${details.exec}`,
      details.deadline && `Deadline: ${details.deadline}`,
      details.location && `Location: ${details.location}`,
      details.budget && `Budget: ₪${details.budget}`,
    ]
      .filter(Boolean)
      .join('\n');

    if (!userMessage.trim()) {
      setError('Fill in at least a title or description first.');
      return;
    }

    setResult(null);
    setError(null);
    setIsLoading(true);

    try {
      const text = await callClaudeAI('crew-recommendation', userMessage);

      const parsed = JSON.parse(text);
      if (typeof parsed.explanation !== 'string' || !Array.isArray(parsed.slots)) {
        throw new Error('Invalid recommendation format');
      }

      const validSlots: CrewRequestSlot[] = parsed.slots.filter((s: Record<string, unknown>) => {
        return typeof s.category === 'string' && ROLE_CATEGORIES.includes(s.category) && typeof s.quantity === 'number' && s.quantity > 0;
      });

      setResult({ explanation: parsed.explanation, slots: validSlots });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to get recommendations');
    } finally {
      setIsLoading(false);
    }
  }

  function clear() {
    setResult(null);
    setError(null);
  }

  return { recommend, result, isLoading, error, clear };
}
