import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

const claudeApiKey = defineSecret('CLAUDE_API_KEY');

type ClaudeMessage = { role: string; content: string };

type CallClaudeInput = {
  system: string;
  messages: ClaudeMessage[];
  max_tokens?: number;
};

export const callClaude = onCall(
  { secrets: [claudeApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { system, messages, max_tokens = 600 } = request.data as CallClaudeInput;

    if (!system || !Array.isArray(messages) || messages.length === 0) {
      throw new HttpsError('invalid-argument', 'system and messages are required');
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey.value(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens,
        system,
        messages,
      }),
    });

    if (!res.ok) {
      throw new HttpsError('internal', `Anthropic API error: ${res.status}`);
    }

    return res.json() as Promise<unknown>;
  },
);
