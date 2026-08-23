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

const CATEGORIES_LIST = ROLE_CATEGORIES.join('\n');

const SYSTEM_PROMPT = `You are a film and media production expert helping clients assemble the right crew for their project.

You must recommend roles ONLY from this exact list — use the exact category names as written:
${CATEGORIES_LIST}

Respond ONLY with a valid JSON object in this exact format (no markdown, no text outside the JSON):
{
  "explanation": "2-3 sentences explaining why you recommend these roles for this specific project",
  "slots": [
    { "category": "exact category name", "quantity": 1 }
  ]
}`;

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
      const text = await callClaudeAI(
        SYSTEM_PROMPT,
        [{ role: 'user', content: userMessage }],
        600,
      );

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
