# Home Hero Card + AI Crew Suggestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the small "Build Crew" button on the client Home dashboard with a full-width dark hero card that embeds a single-shot AI crew suggestion input, and rewrite the screen layout to scroll with a plain map over My Projects.

**Architecture:** A new `useAiCrewSuggestion` hook encapsulates all Anthropic API calls (mocked via `global.fetch` in tests). The Home screen is rewritten as a `ScrollView` containing the hero card followed by the My Projects section; `FlatList` is replaced with a `map` to avoid nested-scrollable issues.

**Tech Stack:** React Native, Expo SDK 56, TypeScript, `@testing-library/react-native`, Jest (preset: jest-expo)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/features/crew/hooks/useAiCrewSuggestion.ts` | Create | Hook: fetch Claude API, expose `suggest`, `suggestion`, `isLoading`, `error` |
| `src/features/crew/hooks/__tests__/useAiCrewSuggestion.test.ts` | Create | Unit tests for the hook (mock `global.fetch`) |
| `src/features/crew/hooks/index.ts` | Modify | Export `useAiCrewSuggestion` |
| `src/app/(client)/(tabs)/home/index.tsx` | Modify | Rewrite: `ScrollView` + hero card + AI area + `map`-based My Projects |

---

### Task 1: `useAiCrewSuggestion` hook

**Files:**
- Create: `src/features/crew/hooks/useAiCrewSuggestion.ts`
- Create: `src/features/crew/hooks/__tests__/useAiCrewSuggestion.test.ts`
- Modify: `src/features/crew/hooks/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/crew/hooks/__tests__/useAiCrewSuggestion.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react-native';
import { useAiCrewSuggestion } from '../useAiCrewSuggestion';

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_CLAUDE_API_KEY = 'test-key';
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_CLAUDE_API_KEY;
});

describe('useAiCrewSuggestion', () => {
  it('calls Anthropic API and sets suggestion on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: 'You need 1 DP and 2 camera operators.' }] }),
    });

    const { result } = renderHook(() => useAiCrewSuggestion());
    await act(async () => {
      await result.current.suggest('Music video shoot');
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'test-key' }),
      })
    );
    expect(result.current.suggestion).toBe('You need 1 DP and 2 camera operators.');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets error on non-ok API response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });

    const { result } = renderHook(() => useAiCrewSuggestion());
    await act(async () => {
      await result.current.suggest('Wedding shoot');
    });

    expect(result.current.error).toBe('API error 401');
    expect(result.current.suggestion).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('sets error on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network failure'));

    const { result } = renderHook(() => useAiCrewSuggestion());
    await act(async () => {
      await result.current.suggest('Commercial shoot');
    });

    expect(result.current.error).toBe('Network failure');
    expect(result.current.isLoading).toBe(false);
  });

  it('does nothing when API key is absent', async () => {
    delete process.env.EXPO_PUBLIC_CLAUDE_API_KEY;

    const { result } = renderHook(() => useAiCrewSuggestion());
    await act(async () => {
      await result.current.suggest('Test project');
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.suggestion).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('resets suggestion and error at start of a new call', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const { result } = renderHook(() => useAiCrewSuggestion());
    await act(async () => {
      await result.current.suggest('First call');
    });
    expect(result.current.error).toBe('API error 500');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ text: 'Fresh suggestion' }] }),
    });
    await act(async () => {
      await result.current.suggest('Second call');
    });
    expect(result.current.error).toBeNull();
    expect(result.current.suggestion).toBe('Fresh suggestion');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npx jest src/features/crew/hooks/__tests__/useAiCrewSuggestion.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../useAiCrewSuggestion'`

- [ ] **Step 3: Implement the hook**

Create `src/features/crew/hooks/useAiCrewSuggestion.ts`:

```ts
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
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: description }],
        }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setSuggestion(data.content[0].text);
    } catch (e: any) {
      setError(e.message ?? 'Failed to get suggestions');
    } finally {
      setIsLoading(false);
    }
  }

  return { suggest, suggestion, isLoading, error };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npx jest src/features/crew/hooks/__tests__/useAiCrewSuggestion.test.ts --no-coverage
```

Expected: PASS — 5 tests pass

- [ ] **Step 5: Export from hooks index**

Edit `src/features/crew/hooks/index.ts` — add one line:

```ts
export { useCrewBuilder } from './useCrewBuilder';
export { useProjectRequests } from './useProjectRequests';
export { useAiCrewSuggestion } from './useAiCrewSuggestion';
```

- [ ] **Step 6: Run full test suite**

```
npx jest --no-coverage
```

Expected: all existing tests still pass (no regressions)

- [ ] **Step 7: Commit**

```
git add src/features/crew/hooks/useAiCrewSuggestion.ts src/features/crew/hooks/__tests__/useAiCrewSuggestion.test.ts src/features/crew/hooks/index.ts
git commit -m "feat: add useAiCrewSuggestion hook with Anthropic API integration"
```

---

### Task 2: Home screen rewrite

**Files:**
- Modify: `src/app/(client)/(tabs)/home/index.tsx`

- [ ] **Step 1: Replace the entire file**

Write `src/app/(client)/(tabs)/home/index.tsx`:

```tsx
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { Screen } from '@components/layout/Screen';
import { ProjectRequestCard } from '@features/crew/components';
import { useProjectRequests, useAiCrewSuggestion } from '@features/crew/hooks';

export default function HomeScreen() {
  const { requests, isLoading } = useProjectRequests();
  const { suggest, suggestion, isLoading: aiLoading, error: aiError } = useAiCrewSuggestion();
  const [description, setDescription] = useState('');

  const apiKeyPresent = !!process.env.EXPO_PUBLIC_CLAUDE_API_KEY;

  return (
    <Screen scrollable={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Build Your Crew</Text>
            <Text style={styles.heroSubtitle}>
              Describe your project for AI crew suggestions
            </Text>

            {apiKeyPresent && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="E.g. I'm shooting a wedding in Dubai for 200 guests…"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  multiline
                  numberOfLines={3}
                  value={description}
                  onChangeText={setDescription}
                />
                {description.trim().length > 0 && (
                  <TouchableOpacity
                    style={[styles.suggestBtn, aiLoading && styles.btnDisabled]}
                    onPress={() => suggest(description.trim())}
                    disabled={aiLoading}
                    activeOpacity={0.8}
                  >
                    {aiLoading ? (
                      <ActivityIndicator color="#111" size="small" />
                    ) : (
                      <Text style={styles.suggestBtnText}>Get Suggestions</Text>
                    )}
                  </TouchableOpacity>
                )}
                {aiError != null && (
                  <Text style={styles.aiError}>{aiError}</Text>
                )}
                {suggestion != null && (
                  <Text style={styles.suggestion}>{suggestion}</Text>
                )}
              </>
            )}

            <TouchableOpacity
              style={styles.buildBtn}
              onPress={() => router.push('/(client)/(tabs)/home/builder')}
              activeOpacity={0.8}
            >
              <Text style={styles.buildBtnText}>Start Building →</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.projectsSection}>
            <Text style={styles.sectionTitle}>My Projects</Text>
            {isLoading ? (
              <ActivityIndicator style={styles.loader} />
            ) : requests.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No projects yet.</Text>
                <Text style={styles.emptyHint}>
                  Tap "Start Building" to create your first request.
                </Text>
              </View>
            ) : (
              requests.map((item) => (
                <ProjectRequestCard key={item.id} request={item} />
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 20, paddingBottom: 40 },
  hero: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#fff' },
  heroSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  suggestBtn: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  suggestBtnText: { color: '#111', fontWeight: '700', fontSize: 14 },
  aiError: { color: '#ff6b6b', fontSize: 13 },
  suggestion: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20 },
  buildBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  buildBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  projectsSection: { gap: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
  loader: { marginTop: 40 },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#333' },
  emptyHint: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
```

- [ ] **Step 2: Run full test suite**

```
npx jest --no-coverage
```

Expected: all tests pass (screen has no unit tests — verified manually)

- [ ] **Step 3: Commit**

```
git add src/app/(client)/(tabs)/home/index.tsx
git commit -m "feat: redesign home screen with hero card and AI crew suggestion"
```

---

## Post-implementation: set the API key

Add to `.env.local` (create the file if it doesn't exist, it is gitignored):

```
EXPO_PUBLIC_CLAUDE_API_KEY=sk-ant-...
```

Without this key the AI input is hidden and the screen degrades gracefully to just the hero card + Start Building button.
