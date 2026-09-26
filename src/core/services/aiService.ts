import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';

/**
 * The tasks the `callClaude` function will run. KEEP IN SYNC with
 * ClaudeTaskName in functions/src/claude/tasks.ts, which owns the system
 * prompt, the token budget and the input ceiling for each one.
 *
 * The client deliberately cannot send a prompt. It used to send `system`,
 * `messages` and `max_tokens`, which made the callable a general-purpose LLM
 * proxy on the platform's API key for anyone with a verified account.
 */
export type ClaudeTask = 'project-title' | 'crew-suggestion' | 'crew-recommendation';

type CallClaudeInput = { task: ClaudeTask; input: string };

type CallClaudeOutput = {
  content: Array<{ type: string; text: string }>;
};

const callClaudeFn = httpsCallable<CallClaudeInput, CallClaudeOutput>(functions, 'callClaude');

export async function callClaudeAI(task: ClaudeTask, input: string): Promise<string> {
  const result = await callClaudeFn({ task, input });
  const text = result.data?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Unexpected response format');
  return text;
}
