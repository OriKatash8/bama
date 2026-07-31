# Chat Status Denormalization — Design Spec

## Problem

Group chat cards in the client chat list show no project status badge. The badge depends on a secondary `getDoc(projects/{projectId})` fetch that runs after chats load. If that fetch fails, the project document is missing, or `projectId` is absent from the chat, `status` stays `undefined` and the badge never renders.

## Solution: Denormalize status onto the chat document

Write `status` directly onto the `chats/{chatId}` Firestore document at every point where `projects/{projectId}.status` is written. The chat list reads `item.status` with no secondary fetch.

---

## Data Model

Add one optional field to the `Chat` type:

```ts
// src/features/chat/types.ts
status?: 'open' | 'in_progress' | 'completed' | 'cancelled';
```

This field is only present on `type: 'group'` chats. Community and DM chats leave it undefined (no badge shown, same as today).

---

## Write Path — four sites

### 1. `chatService.ts` — `createProjectGroup`
Group chat is created here when the first offer is accepted. Add `status: 'open'` to the initial document.

```ts
await addDoc(chatsRef, {
  type: 'group',
  name: projectName,
  projectId,
  status: 'open',   // ← add
  members: [clientId, professionalId],
  ...
});
```

### 2. `project-details.tsx` — mark project completed (line ~254)
Already has `const chatId = project.chatId`. After writing to the project, also update the chat:

```ts
await updateDoc(doc(db, 'projects', projectId), { status: 'completed', ... });
if (project.chatId) {
  await updateDoc(doc(db, 'chats', project.chatId), { status: 'completed' });
}
```

### 3. `project-details.tsx` — re-open project (line ~376)
Same pattern. After writing `status: 'open'` to the project:

```ts
await updateDoc(doc(db, 'projects', projectId), updates); // updates includes status: 'open'
if (chatId) {
  await updateDoc(doc(db, 'chats', chatId), { status: 'open' });
}
```

`chatId` is already in scope at that point (`const chatId = project.chatId` line ~352).

### 4. `paymentService.ts` — `markProjectComplete`
This function only receives `projectId`. Add a `chatId` parameter (caller already has it from the loaded project):

```ts
export async function markProjectComplete(projectId: string, chatId?: string): Promise<void> {
  await updateDoc(doc(db, 'projects', projectId), { status: 'completed', completedAt: serverTimestamp() });
  if (chatId) {
    await updateDoc(doc(db, 'chats', chatId), { status: 'completed' });
  }
}
```

Callers pass `project.chatId` when calling `markProjectComplete`.

---

## Read Path — ChatsScreen.tsx

Remove the entire secondary fetch block:
- Delete `projectStatuses` state and its `useEffect`
- Delete `fetchedChatProjectIdsRef`

Change the per-card status derivation from:
```ts
const status = item.type === 'group' ? projectStatuses[item.id] : undefined;
```
to:
```ts
const status = item.type === 'group' ? item.status : undefined;
```

Everything else (badge render, `STATUS_CONFIG`, `statusLabel`) stays identical.

---

## Backwards Compatibility

Existing group chat documents without a `status` field show no badge — identical to the current broken state. The field is written on every future status transition; existing chats get it on the next status change with no migration needed.

---

## Files Changed

| File | Change |
|------|--------|
| `src/features/chat/types.ts` | Add `status?` field to `Chat` |
| `src/features/chat/services/chatService.ts` | Write `status: 'open'` in `createProjectGroup` |
| `src/app/(client)/(tabs)/chat/project-details.tsx` | Mirror status to chat on complete + re-open |
| `src/features/chat/services/paymentService.ts` | Add `chatId?` param to `markProjectComplete`, mirror status |
| `src/features/chat/screens/ChatsScreen.tsx` | Remove async fetch; read `item.status` directly |
