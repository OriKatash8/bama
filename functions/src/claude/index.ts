import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { assertVerifiedEmail } from '../auth/verifiedEmail';
import { checkAllWindows, type WindowSpec } from '../communities/rateLimit';
import { CLAUDE_TASKS, isClaudeTaskName, type ClaudeTaskName } from './tasks';

/**
 * NOT DEPLOYED. See scripts/deploy-drift-allowlist.json.
 *
 * The three hooks that call this — useGenerateTitle, useAiCrewSuggestion,
 * useAiCrewRecommendation — are exported from src/features/crew/hooks and
 * imported by nothing. No screen invokes it, so leaving it deployed meant an
 * authenticated endpoint spending the platform's Anthropic key with no
 * legitimate caller at all.
 *
 * The guards below are real and tested-by-construction; deploy this in the same
 * change that wires up the UI, and remove the allowlist entry then.
 */
const claudeApiKey = defineSecret('CLAUDE_API_KEY');

/**
 * Per-user quotas. Burst first — see checkAllWindows on why order matters.
 *
 * There was no limit of any kind before. Auth plus a verified email was the
 * whole gate, so one account could loop this endpoint for as long as it liked;
 * the only ceiling on the bill was how fast the caller could send requests.
 * Sixty calls a day is far above any real use of three buttons that name a
 * project and suggest a crew, and far below a bill worth noticing.
 */
const CLAUDE_QUOTAS: WindowSpec[] = [
  { prefix: 'ai-burst', limit: 10, windowMs: 60_000 },
  { prefix: 'ai-daily', limit: 60, windowMs: 24 * 60 * 60_000 },
];

type CallClaudeInput = { task?: unknown; input?: unknown };

/**
 * Run one of the fixed tasks in ./tasks.ts against the caller's text.
 *
 * The caller chooses a task and supplies one string. It does NOT supply the
 * system prompt, the message list, or the token budget — see the note at the
 * top of tasks.ts for what that used to allow.
 */
export const callClaude = onCall(
  { secrets: [claudeApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    // Costs money per call: an unverified password account may not spend it.
    assertVerifiedEmail(request);

    const { task, input } = (request.data ?? {}) as CallClaudeInput;

    if (!isClaudeTaskName(task)) {
      throw new HttpsError('invalid-argument', 'Unknown task');
    }
    if (typeof input !== 'string' || input.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'input must be a non-empty string');
    }

    const spec = CLAUDE_TASKS[task as ClaudeTaskName];
    if (input.length > spec.maxInputChars) {
      throw new HttpsError(
        'invalid-argument',
        `input exceeds ${spec.maxInputChars} characters for this task`,
      );
    }

    // Keyed by uid, not IP: the endpoint is authenticated, so the account is the
    // thing being limited and a shared network must not throttle its users.
    const decision = await checkAllWindows(`claude:${request.auth.uid}`, CLAUDE_QUOTAS);
    if (!decision.allowed) {
      throw new HttpsError(
        'resource-exhausted',
        `Too many AI requests. Try again in ${decision.retryAfterSec}s.`,
      );
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
        max_tokens: spec.maxTokens,
        system: spec.system,
        messages: [{ role: 'user', content: input }],
      }),
    });

    if (!res.ok) {
      // The upstream body can echo the request; never return it to the caller.
      console.error('[callClaude] Anthropic API error', res.status, await res.text().catch(() => ''));
      throw new HttpsError('internal', `Anthropic API error: ${res.status}`);
    }

    return res.json() as Promise<unknown>;
  },
);
