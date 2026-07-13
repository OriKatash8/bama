import { useState } from 'react';
import { callClaudeAI } from '@core/services/aiService';

const SYSTEM_PROMPT =
  'You generate short project titles. Given a project description, respond with ONLY a title of 3-6 words that summarizes it. No quotes, no punctuation at the end, no explanation. Match the language of the input — if the description is in Hebrew, respond in Hebrew.';

export type UseGenerateTitleReturn = {
  generateTitle: (description: string) => Promise<string>;
  isGenerating: boolean;
  error: string | null;
};

export function useGenerateTitle(): UseGenerateTitleReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateTitle(description: string): Promise<string> {
    setIsGenerating(true);
    setError(null);
    try {
      console.log('[useGenerateTitle] calling callClaudeAI, description length:', description.length);
      const text = await callClaudeAI(
        SYSTEM_PROMPT,
        [{ role: 'user', content: description }],
        30,
      );
      return text.trim();
    } catch (e: unknown) {
      console.error('[useGenerateTitle] error:', e);
      if (e !== null && typeof e === 'object') {
        const err = e as Record<string, unknown>;
        console.error('[useGenerateTitle] code:', err['code'], '| message:', err['message'], '| details:', err['details']);
      }
      const msg = e instanceof Error ? e.message : 'Failed to generate title';
      setError(msg);
      throw e;
    } finally {
      setIsGenerating(false);
    }
  }

  return { generateTitle, isGenerating, error };
}
