import { useState } from 'react';

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
    const apiKey = process.env.EXPO_PUBLIC_CLAUDE_API_KEY;
    if (!apiKey) return;

    const controller = new AbortController();
    setSuggestion(null);
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
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: description }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const text = data?.content?.[0]?.text;
      if (typeof text === 'string') {
        setSuggestion(text);
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Failed to get suggestions');
    } finally {
      setIsLoading(false);
    }
  }

  return { suggest, suggestion, isLoading, error };
}
