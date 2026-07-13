import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';

type ClaudeMessage = { role: string; content: string };

type CallClaudeInput = {
  system: string;
  messages: ClaudeMessage[];
  max_tokens?: number;
};

type CallClaudeOutput = {
  content: Array<{ type: string; text: string }>;
};

const callClaudeFn = httpsCallable<CallClaudeInput, CallClaudeOutput>(functions, 'callClaude');

export async function callClaudeAI(
  system: string,
  messages: ClaudeMessage[],
  max_tokens?: number,
): Promise<string> {
  const result = await callClaudeFn({ system, messages, max_tokens });
  const text = result.data?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Unexpected response format');
  return text;
}
