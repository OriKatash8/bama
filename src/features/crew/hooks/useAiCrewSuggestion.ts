import { useState } from 'react';
import { callClaudeAI } from '@core/services/aiService';

const SYSTEM_PROMPT =
  'You are a film and media production expert. Given a project description, list the crew roles the client will likely need, with approximate quantities. Be concise — one short paragraph, plain text, no bullet points, no markdown. Focus only on crew (people), not equipment or locations.';

export type UseAiCrewSuggestionReturn = {
  suggest: (description: string) => Promise<void>;
  suggestion: string | null;
  isLoading: boolean;
  error: string | null;
};

export function useAiCrewSuggestion(): UseAiCrewSuggestionReturn {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function suggest(description: string): Promise<void> {
    if (!description.trim()) return;

    setSuggestion(null);
    setError(null);
    setIsLoading(true);

    try {
      const text = await callClaudeAI(
        SYSTEM_PROMPT,
        [{ role: 'user', content: description }],
        300,
      );
      setSuggestion(text);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to get suggestions');
    } finally {
      setIsLoading(false);
    }
  }

  return { suggest, suggestion, isLoading, error };
}
