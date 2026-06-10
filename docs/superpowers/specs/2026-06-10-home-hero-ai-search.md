# Home Screen — Hero Card + AI Crew Suggestion Design

**Date:** 2026-06-10
**Feature:** Enhance client Home dashboard with a prominent Build Crew hero section and a single-shot AI crew suggestion bar.

---

## Goal

Replace the small "Build Crew" button in the Home header with a full-width dark hero card that visually anchors the screen. Embed a single-shot AI input inside the card so clients can describe their project and receive advisory crew suggestions before deciding to open the builder.

---

## Screen Structure

The Home screen (`src/app/(client)/(tabs)/home/index.tsx`) is restructured as:

1. **Hero card** (dark, full-width, rounded) — always visible at the top
2. **My Projects section** — below the hero card, scrolls with the page

The current `<Screen scrollable={false}>` + `<FlatList>` pattern is replaced with a `<ScrollView>`. The `FlatList` becomes a plain `map` over the requests array to avoid nested-scrollable issues in React Native.

---

## Hero Card

**Contents (top to bottom):**

- Title: `"Build Your Crew"` — large, white, bold
- Subtitle: `"Describe your project for AI crew suggestions"` — small, muted white
- Multiline `TextInput` — light placeholder: `"E.g. I'm shooting a wedding in Dubai for 200 guests…"` — white background, rounded
- **"Get Suggestions" button** — triggers AI call; disabled while loading; hidden when no input
- AI result area — renders below the input after a successful call:
  - Loading: `ActivityIndicator`
  - Success: plain `Text` block with the suggestion string
  - Error: short inline error message in red-ish tint
- **"Start Building →" button** — white background, dark text, navigates to `/(client)/(tabs)/home/builder`

---

## AI Logic

### Hook: `useAiCrewSuggestion`

**Location:** `src/features/crew/hooks/useAiCrewSuggestion.ts`

**Interface:**
```ts
type UseAiCrewSuggestionReturn = {
  suggest: (description: string) => Promise<void>;
  suggestion: string | null;
  isLoading: boolean;
  error: string | null;
};
```

**Behaviour:**
- Calls `https://api.anthropic.com/v1/messages` via `fetch` (no SDK)
- Model: `claude-haiku-4-5-20251001`
- Single-shot: no conversation history, each call is independent
- `max_tokens: 300` — enough for a short role list, prevents runaway output
- System prompt instructs Claude to return a concise crew recommendation (roles + rough quantities) for the described project, in plain prose — no markdown, no JSON
- `suggestion` is reset to `null` when a new call starts
- `error` is reset to `null` when a new call starts

**System prompt (exact):**
```
You are a film and media production expert. Given a project description, list the crew roles the client will likely need, with approximate quantities. Be concise — one short paragraph, plain text, no bullet points, no markdown. Focus only on crew (people), not equipment or locations.
```

### Environment variable

`EXPO_PUBLIC_CLAUDE_API_KEY` — set in `.env.local` (gitignored). Accessed as `process.env.EXPO_PUBLIC_CLAUDE_API_KEY` in the hook. If absent, the "Get Suggestions" button is hidden and the feature is silently disabled.

---

## My Projects Section

Unchanged in behaviour. The section header `"My Projects"` appears below the hero card. Empty state and loaded card list remain identical; only the rendering mechanism changes from `FlatList` to a `map` inside the `ScrollView`.

---

## Files Changed

| File | Change |
|---|---|
| `src/app/(client)/(tabs)/home/index.tsx` | Full rewrite — ScrollView layout, hero card, AI result area |
| `src/features/crew/hooks/useAiCrewSuggestion.ts` | New hook |
| `src/features/crew/hooks/index.ts` | Export `useAiCrewSuggestion` |
| `.env.local` | Add `EXPO_PUBLIC_CLAUDE_API_KEY` (user must set manually) |

---

## Testing

- `useAiCrewSuggestion` unit tests: mock `fetch`, assert `suggestion` populated on success, `error` populated on failure, `isLoading` transitions correct
- No snapshot tests for the screen — visual layout verified manually on device/simulator

---

## Out of Scope

- The AI suggestion does **not** auto-populate the crew builder
- No chat / follow-up turns
- No caching of suggestions
- No streaming — full response arrives at once
