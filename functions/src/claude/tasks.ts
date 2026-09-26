/**
 * The complete set of things a client may ask the model to do.
 *
 * WHY THIS FILE EXISTS. `callClaude` used to take `system`, `messages` and
 * `max_tokens` straight from the caller and forward them to the Anthropic API
 * on the platform's key. Any verified account could therefore send any prompt,
 * of any length, asking for any number of output tokens — a general-purpose LLM
 * proxy billed to BAMA, reachable from a script with a signed-up email. Nothing
 * in the app ever needed that: all three call sites send ONE fixed system
 * prompt, ONE user message, and a fixed token budget.
 *
 * So the callable no longer accepts a prompt. It accepts a TASK NAME, and every
 * knob that costs money lives here, server-side.
 */

export type ClaudeTaskName = 'project-title' | 'crew-suggestion' | 'crew-recommendation';

export type ClaudeTask = {
  system: string;
  /** Hard output ceiling. The client cannot raise it and does not send one. */
  maxTokens: number;
  /** Hard input ceiling, in characters, on the single user message. */
  maxInputChars: number;
};

/**
 * KEEP IN SYNC with ROLE_CATEGORIES in src/features/crew/data/categories.ts.
 *
 * A functions/ build cannot import from src/, which is the same constraint that
 * produced functions/src/matching.ts and the third copy of the price bounds in
 * firestore.rules. Unlike those, this one is checked: functions/src/claude/
 * __tests__/categoriesInSync.test.ts imports BOTH and fails if they diverge, so
 * a role added to the app cannot silently go missing from the prompt.
 */
export const AI_ROLE_CATEGORIES: readonly string[] = [
  'Video Photographer',
  'Still Photographer',
  'Editor',
  'Graphic Designer',
  'Social Media',
  'Studio & Audio',
  'Sound Recordist',
  'Lighting Tech',
];

export const CLAUDE_TASKS: Record<ClaudeTaskName, ClaudeTask> = {
  'project-title': {
    system:
      'You generate short project titles. Given a project description, respond with ONLY a title of 3-6 words that summarizes it. No quotes, no punctuation at the end, no explanation. Match the language of the input — if the description is in Hebrew, respond in Hebrew.',
    maxTokens: 30,
    maxInputChars: 4000,
  },
  'crew-suggestion': {
    system:
      'You are a film and media production expert. Given a project description, list the crew roles the client will likely need, with approximate quantities. Be concise — one short paragraph, plain text, no bullet points, no markdown. Focus only on crew (people), not equipment or locations.',
    maxTokens: 300,
    maxInputChars: 4000,
  },
  'crew-recommendation': {
    system: `You are a film and media production expert helping clients assemble the right crew for their project.

You must recommend roles ONLY from this exact list — use the exact category names as written:
${AI_ROLE_CATEGORIES.join('\n')}

Respond ONLY with a valid JSON object in this exact format (no markdown, no text outside the JSON):
{
  "explanation": "2-3 sentences explaining why you recommend these roles for this specific project",
  "slots": [
    { "category": "exact category name", "quantity": 1 }
  ]
}`,
    maxTokens: 600,
    maxInputChars: 6000,
  },
};

export function isClaudeTaskName(v: unknown): v is ClaudeTaskName {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CLAUDE_TASKS, v);
}
