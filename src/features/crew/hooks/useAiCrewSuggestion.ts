import { useState } from 'react';
import { callClaudeAI } from '@core/services/aiService';

// The system prompt and token budget for this task live server-side, in
// functions/src/claude/tasks.ts under 'crew-suggestion'.

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
      const text = await callClaudeAI('crew-suggestion', description);
      setSuggestion(text);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to get suggestions');
    } finally {
      setIsLoading(false);
    }
  }

  return { suggest, suggestion, isLoading, error };
}
