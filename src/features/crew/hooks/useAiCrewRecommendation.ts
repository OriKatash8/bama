import { useState } from 'react';
import { CREW_CATEGORIES } from '../data/categories';
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

const CATEGORIES_LIST = Object.entries(CREW_CATEGORIES)
  .map(([cat, subs]) => `${cat}: ${subs.join(', ')}`)
  .join('\n');

const SYSTEM_PROMPT = `You are a film and media production expert helping clients assemble the right crew for their project.

You must recommend roles ONLY from this exact list — use the exact category and subcategory names as written:
${CATEGORIES_LIST}

Respond ONLY with a valid JSON object in this exact format (no markdown, no text outside the JSON):
{
  "explanation": "2-3 sentences explaining why you recommend these roles for this specific project",
  "slots": [
    { "category": "exact category name", "subcategory": "exact subcategory name", "quantity": 1 }
  ]
}`;

export function useAiCrewRecommendation(): UseAiCrewRecommendationReturn {
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function recommend(details: Details): Promise<void> {
    const apiKey = process.env.EXPO_PUBLIC_CLAUDE_API_KEY;
    if (!apiKey) {
      setError('AI suggestions are not configured.');
      return;
    }

    const userMessage = [
      details.title && `Title: ${details.title}`,
      details.description && `Description: ${details.description}`,
      details.exec && `Execution: ${details.exec}`,
      details.deadline && `Deadline: ${details.deadline}`,
      details.location && `Location: ${details.location}`,
      details.budget && `Budget: $${details.budget}`,
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
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 600,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);

      const data = await res.json();
      const text = data?.content?.[0]?.text;
      if (typeof text !== 'string') throw new Error('Unexpected response format');

      const parsed = JSON.parse(text);
      if (typeof parsed.explanation !== 'string' || !Array.isArray(parsed.slots)) {
        throw new Error('Invalid recommendation format');
      }

      // Filter to only valid category/subcategory pairs
      const validSlots: CrewRequestSlot[] = parsed.slots.filter((s: any) => {
        const subs = CREW_CATEGORIES[s.category as keyof typeof CREW_CATEGORIES];
        return subs && subs.includes(s.subcategory) && typeof s.quantity === 'number' && s.quantity > 0;
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
