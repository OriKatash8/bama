# Client Project Edit & Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a client to edit or delete their submitted crew requests from the "My Projects" section in Chats → Notifications, with edit opening the full crew builder pre-populated and delete requiring confirmation.

**Architecture:** Four targeted changes. `useProjectRequests` gains `updateProject` and `deleteProject`. `useCrewBuilder` gains `loadSlots` for async slot seeding. `builder.tsx` reads an optional `projectId` route param and enters edit mode when present. `ProjectRequestCard` shows Edit/Delete buttons for `open` projects only; the card calls `deleteDocument` directly to avoid creating N Firestore subscriptions per rendered card.

**Tech Stack:** React Native (Expo SDK 56), TypeScript, Firebase Firestore, Expo Router v3, Jest + `@testing-library/react-native`

## Global Constraints

- Edit and Delete buttons only appear when `request.status === 'open'`
- Delete requires `Alert.alert()` confirmation before executing
- Edit opens the full crew builder (title, description, date, location, crew slots all editable)
- All Firestore writes use existing helpers in `src/core/firebase/firestore.ts`
- Test pattern: `renderHook`, `act`, top-level `jest.mock` — match existing test files exactly

---

### Task 1: Add updateProject and deleteProject to useProjectRequests

**Files:**
- Modify: `src/features/crew/hooks/useProjectRequests.ts`
- Modify: `src/features/crew/hooks/__tests__/useProjectRequests.test.ts`

**Interfaces:**
- Consumes: `updateDocument`, `deleteDocument` from `@core/firebase/firestore` (already exported there)
- Produces: `updateProject(id: string, slots: CrewRequestSlot[], details: SubmitDetails): Promise<void>` and `deleteProject(id: string): Promise<void>` — both in the hook's return value. Used by builder.tsx (Task 3) and available for any future callers.

- [ ] **Step 1: Write the failing tests**

Open `src/features/crew/hooks/__tests__/useProjectRequests.test.ts` and make these changes:

Replace the `jest.mock` block with:
```typescript
jest.mock('@core/firebase/firestore', () => ({
  addDocument: jest.fn(),
  subscribeToCollection: jest.fn(),
  where: jest.fn(() => ({ type: 'where-constraint' })),
  updateDocument: jest.fn(),
  deleteDocument: jest.fn(),
}));
```

Add these two typed mock variables after the existing `mockAddDocument` and `mockSubscribeToCollection` declarations:
```typescript
import { updateDocument, deleteDocument } from '@core/firebase/firestore';
const mockUpdateDocument = updateDocument as jest.MockedFunction<typeof updateDocument>;
const mockDeleteDocument = deleteDocument as jest.MockedFunction<typeof deleteDocument>;
```

Update `beforeEach` to include default resolved values for the new mocks:
```typescript
beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: mockUser, activeMode: 'client', isLoading: false });
  mockSubscribeToCollection.mockReturnValue(() => {});
  mockUpdateDocument.mockResolvedValue(undefined);
  mockDeleteDocument.mockResolvedValue(undefined);
});
```

Add these four tests inside the `describe('useProjectRequests')` block:
```typescript
it('updateProject calls updateDocument with correct path and payload', async () => {
  const { result } = renderHook(() => useProjectRequests());
  const slots = [{ category: 'Editor', subcategory: 'Video Editor', quantity: 2 }];
  const details = { title: 'Updated', description: 'New desc', date: '2026-08-01', location: 'Paris' };
  await act(async () => {
    await result.current.updateProject('proj-1', slots, details);
  });
  expect(mockUpdateDocument).toHaveBeenCalledWith(
    'projects/proj-1',
    expect.objectContaining({ crewSlots: slots, title: 'Updated', description: 'New desc', date: '2026-08-01', location: 'Paris' })
  );
});

it('updateProject sets error and rethrows on failure', async () => {
  mockUpdateDocument.mockRejectedValue(new Error('Update failed'));
  const { result } = renderHook(() => useProjectRequests());
  await act(async () => {
    try {
      await result.current.updateProject('x', [], { title: '', description: '', date: '', location: '' });
    } catch {}
  });
  expect(result.current.error).toBe('Update failed');
});

it('deleteProject calls deleteDocument with correct path', async () => {
  const { result } = renderHook(() => useProjectRequests());
  await act(async () => {
    await result.current.deleteProject('proj-1');
  });
  expect(mockDeleteDocument).toHaveBeenCalledWith('projects/proj-1');
});

it('deleteProject sets error and rethrows on failure', async () => {
  mockDeleteDocument.mockRejectedValue(new Error('Delete failed'));
  const { result } = renderHook(() => useProjectRequests());
  await act(async () => {
    try {
      await result.current.deleteProject('x');
    } catch {}
  });
  expect(result.current.error).toBe('Delete failed');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx jest --testPathPattern="useProjectRequests" --no-coverage
```

Expected: 4 new tests fail with `result.current.updateProject is not a function` and `result.current.deleteProject is not a function`

- [ ] **Step 3: Implement updateProject and deleteProject**

In `src/features/crew/hooks/useProjectRequests.ts`, update the import line:
```typescript
import { addDocument, subscribeToCollection, where, updateDocument, deleteDocument } from '@core/firebase/firestore';
```

Add these two functions inside `useProjectRequests`, after the `submit` function:
```typescript
async function updateProject(
  id: string,
  slots: CrewRequestSlot[],
  details: SubmitDetails
): Promise<void> {
  setError(null);
  try {
    await updateDocument(`projects/${id}`, { crewSlots: slots, ...details });
  } catch (e: any) {
    const message = e.message ?? 'Failed to update project';
    setError(message);
    throw e;
  }
}

async function deleteProject(id: string): Promise<void> {
  setError(null);
  try {
    await deleteDocument(`projects/${id}`);
  } catch (e: any) {
    const message = e.message ?? 'Failed to delete project';
    setError(message);
    throw e;
  }
}
```

Update the return statement:
```typescript
return { requests, isLoading, error, submit, updateProject, deleteProject };
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx jest --testPathPattern="useProjectRequests" --no-coverage
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/crew/hooks/useProjectRequests.ts src/features/crew/hooks/__tests__/useProjectRequests.test.ts
git commit -m "feat: add updateProject and deleteProject to useProjectRequests"
```

---

### Task 2: Add loadSlots to useCrewBuilder

**Files:**
- Modify: `src/features/crew/hooks/useCrewBuilder.ts`
- Modify: `src/features/crew/hooks/__tests__/useCrewBuilder.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `loadSlots(newSlots: CrewRequestSlot[]): void` — replaces the entire slots array in one call; exported from the hook's return value. Used by builder.tsx (Task 3) after asynchronously fetching the project to edit.

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe('useCrewBuilder')` block in `src/features/crew/hooks/__tests__/useCrewBuilder.test.ts`:
```typescript
it('loadSlots replaces all current slots with the provided array', () => {
  const { result } = renderHook(() => useCrewBuilder());
  act(() => {
    result.current.addSlot('Editor', 'Video Editor');
  });
  act(() => {
    result.current.loadSlots([
      { category: 'Still Photographer', subcategory: 'Fashion', quantity: 2 },
    ]);
  });
  expect(result.current.slots).toEqual([
    { category: 'Still Photographer', subcategory: 'Fashion', quantity: 2 },
  ]);
  expect(result.current.totalCount).toBe(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx jest --testPathPattern="useCrewBuilder" --no-coverage
```

Expected: new test fails with `result.current.loadSlots is not a function`

- [ ] **Step 3: Implement loadSlots**

In `src/features/crew/hooks/useCrewBuilder.ts`, add `loadSlots` after the `reset` function:
```typescript
function loadSlots(newSlots: CrewRequestSlot[]) {
  setSlots(newSlots);
}
```

Update the return statement:
```typescript
return { slots, totalCount, addSlot, removeSlot, reset, loadSlots };
```

- [ ] **Step 4: Run tests to verify all pass**

```
npx jest --testPathPattern="useCrewBuilder" --no-coverage
```

Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/crew/hooks/useCrewBuilder.ts src/features/crew/hooks/__tests__/useCrewBuilder.test.ts
git commit -m "feat: add loadSlots to useCrewBuilder for async slot seeding"
```

---

### Task 3: Edit mode in builder.tsx

**Files:**
- Modify: `src/app/(client)/(tabs)/home/builder.tsx`

**Interfaces:**
- Consumes: `updateProject` from `useProjectRequests` (Task 1), `loadSlots` from `useCrewBuilder` (Task 2), `getDocument` from `@core/firebase/firestore`, `useLocalSearchParams` from `expo-router`, `ProjectRequest` type from `@core/types/project`, `ActivityIndicator` from `react-native`
- Produces: builder screen that reads optional `projectId` query param — when present, fetches the project, pre-populates all fields, and calls `updateProject` on save instead of `submit`

No test file exists for this screen. Verification is manual (Step 5).

- [ ] **Step 1: Update imports**

In `src/app/(client)/(tabs)/home/builder.tsx`:

Add `ActivityIndicator` to the React Native import:
```typescript
import {
  ScrollView, StyleSheet, View, Text, TextInput, TouchableOpacity, Platform,
  Image, useWindowDimensions, Modal, Animated, TouchableWithoutFeedback, ActivityIndicator,
} from 'react-native';
```

Update the `expo-router` import (currently `import { router } from 'expo-router'`) to:
```typescript
import { router, useLocalSearchParams } from 'expo-router';
```

Add two new imports after the existing imports:
```typescript
import { getDocument } from '@core/firebase/firestore';
import type { ProjectRequest } from '@core/types/project';
```

- [ ] **Step 2: Wire up edit-mode state and data fetching**

Inside `BuilderScreen`, after the `const colors = useTheme();` line, add:
```typescript
const { projectId } = useLocalSearchParams<{ projectId?: string }>();
const isEditMode = !!projectId;
const [isLoadingProject, setIsLoadingProject] = useState(false);
```

Update the `useCrewBuilder` destructure (currently `{ slots, totalCount, addSlot, removeSlot }`) to include `loadSlots`:
```typescript
const { slots, totalCount, addSlot, removeSlot, loadSlots } = useCrewBuilder();
```

Update the `useProjectRequests` destructure (currently `{ submit }`) to include `updateProject`:
```typescript
const { submit, updateProject } = useProjectRequests();
```

Add a `useEffect` after all the `useState` declarations (before `selectedCategory` state) to fetch and pre-populate in edit mode:
```typescript
useEffect(() => {
  if (!projectId) return;
  setIsLoadingProject(true);
  getDocument<ProjectRequest>(`projects/${projectId}`)
    .then((project) => {
      if (!project) return;
      setTitle(project.title);
      setDescription(project.description);
      setDate(project.date);
      setLocation(project.location);
      loadSlots(project.crewSlots);
    })
    .finally(() => setIsLoadingProject(false));
}, [projectId]);
```

- [ ] **Step 3: Update handleSubmit and button label**

Replace the existing `handleSubmit` function with:
```typescript
async function handleSubmit() {
  if (!validate()) return;
  setIsSubmitting(true);
  try {
    if (isEditMode && projectId) {
      await updateProject(projectId, slots, { title, description, date, location });
      showToast('Project updated!', 'success');
    } else {
      await submit(slots, { title, description, date, location });
    }
    router.back();
  } catch (e: any) {
    showToast(
      e.message ?? (isEditMode ? 'Failed to update project' : 'Failed to submit request'),
      'error'
    );
  } finally {
    setIsSubmitting(false);
  }
}
```

Add a loading guard at the very top of the `return` statement in `BuilderScreen` (before `<Screen scrollable={false} ...>`):
```tsx
if (isLoadingProject) {
  return (
    <Screen scrollable={false} backgroundColor={colors.bg}>
      <ActivityIndicator color={colors.accent} style={{ flex: 1, marginTop: 80 }} />
    </Screen>
  );
}
```

Update the submit button `<Text>` inside the JSX:
```tsx
<Text style={styles.submitText}>
  {isSubmitting
    ? (isEditMode ? 'Saving…' : 'Submitting…')
    : isEditMode
      ? 'Save Changes'
      : `Submit Request${totalCount > 0 ? ` (${totalCount} role${totalCount === 1 ? '' : 's'})` : ''}`}
</Text>
```

- [ ] **Step 4: Run all hook tests to confirm no regressions**

```
npx jest --no-coverage
```

Expected: all tests PASS

- [ ] **Step 5: Test manually in the app**

1. Start the app: `npx expo start`
2. Log in as a client who has at least one `open` project
3. Navigate to Chats → Notifications → My Projects
4. Tap **Edit** on an open project card
5. Confirm the builder opens pre-populated with the project's existing title, description, date, location, and crew role counts highlighted
6. Change the title to something new and tap **Save Changes**
7. Confirm a "Project updated!" toast appears and you return to the Chats screen
8. Confirm the project card now shows the new title

- [ ] **Step 6: Commit**

```bash
git add src/app/(client)/(tabs)/home/builder.tsx
git commit -m "feat: add edit mode to builder screen via projectId route param"
```

---

### Task 4: Edit/Delete action row in ProjectRequestCard

**Files:**
- Modify: `src/features/crew/components/ProjectRequestCard.tsx`

**Interfaces:**
- Consumes: `deleteDocument` from `@core/firebase/firestore` (called directly — avoids creating one Firestore subscription per rendered card), `router` from `expo-router`, `useUiStore` from `@core/stores/uiStore`, `Alert` from `react-native`
- Produces: action row with Edit and Delete buttons visible at the bottom of the card when `request.status === 'open'`

No test file exists for this component. Verification is manual (Step 3).

- [ ] **Step 1: Update imports and add handlers**

In `src/features/crew/components/ProjectRequestCard.tsx`:

Update the React Native import to add `Alert`:
```typescript
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
```

Add these imports after the existing imports:
```typescript
import { router } from 'expo-router';
import { deleteDocument } from '@core/firebase/firestore';
import { useUiStore } from '@core/stores/uiStore';
```

Inside `ProjectRequestCard`, after the existing `const colors = useTheme();` line, add:
```typescript
const { showToast } = useUiStore();

function handleEdit() {
  router.push(`/(client)/(tabs)/home/builder?projectId=${request.id}` as any);
}

function handleDelete() {
  Alert.alert(
    'Delete project?',
    'This cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDocument(`projects/${request.id}`);
            showToast('Project deleted', 'success');
          } catch {
            showToast('Failed to delete project', 'error');
          }
        },
      },
    ]
  );
}
```

- [ ] **Step 2: Add the action row to the JSX**

Inside the card's `<View>` (the root card container), add this block after the team section (just before the closing `</View>`):

```tsx
{request.status === 'open' && (
  <View style={[styles.actionRow, { borderTopColor: colors.border }]}>
    <TouchableOpacity onPress={handleEdit} activeOpacity={0.7}>
      <Text style={[styles.actionText, { color: colors.accent }]}>Edit</Text>
    </TouchableOpacity>
    <TouchableOpacity onPress={handleDelete} activeOpacity={0.7}>
      <Text style={[styles.actionText, { color: '#e53e3e' }]}>Delete</Text>
    </TouchableOpacity>
  </View>
)}
```

Add to `StyleSheet.create`:
```typescript
actionRow: {
  flexDirection: 'row',
  justifyContent: 'flex-end',
  gap: 16,
  marginTop: 12,
  paddingTop: 10,
  borderTopWidth: 1,
},
actionText: { fontSize: 13, fontWeight: '700' },
```

- [ ] **Step 3: Test manually in the app**

1. Navigate to Chats → Notifications → My Projects
2. Confirm `open` projects show **Edit** and **Delete** at the card bottom
3. Confirm projects with status `in_progress`, `completed`, or `cancelled` show no buttons
4. Tap **Delete** → confirm the Alert appears: "Delete project?" / "This cannot be undone." with Cancel and Delete options
5. Tap **Cancel** → confirm the project is still present in the list
6. Tap **Delete** again → tap **Delete** in the alert → confirm the card disappears from the list and a "Project deleted" toast appears
7. Tap **Edit** on an open project → confirm the builder opens in edit mode (pre-populated per Task 3 test)

- [ ] **Step 4: Commit**

```bash
git add src/features/crew/components/ProjectRequestCard.tsx
git commit -m "feat: add edit and delete actions to ProjectRequestCard for open projects"
```
