import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text } from 'react-native';
import { renderRouter, act, screen } from 'expo-router/testing-library';
import { Slot, Stack, router } from 'expo-router';

/**
 * PROJECT DETAILS OPENS IN THE VIEWER'S OWN STACK — the same fix as community
 * details (communityDetailsNav.test.tsx), for the same reason.
 *
 * It existed only at (client)/chat/project-details and every link used that
 * path, so from a PRO chat it opened in the client stack with no chat under it.
 * Its back arrow papered over that by PUSHING a client copy of the chat, which
 * stacked a second room and left the swipe from it landing on project details.
 */

const SRC = join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');
const APP = join(SRC, 'app');
const DETAILS = read('app', '(client)', 'chat', 'project-details.tsx');
const NOTIFS = read('core', 'notifications', 'useNotificationRouting.ts');

describe('route files', () => {
  it('project-details exists in the pro chat stack too', () => {
    expect(() => readFileSync(join(APP, '(professional)', 'chat', 'project-details.tsx'))).not.toThrow();
  });
});

describe('no link hard-codes the client stack', () => {
  it.each([
    ['features', 'chat', 'screens', 'ChatRoomScreen.tsx'],
    ['features', 'chat', 'components', 'candidates', 'CandidateProCard.tsx'],
    ['features', 'chat', 'components', 'candidates', 'CandidateReviewCard.tsx'],
    ['features', 'pricing', 'components', 'SlotBlockedSheet.tsx'],
  ])('%s/%s/%s…', (...p) => {
    expect(read(...p)).not.toMatch(/\/\(client\)\/chat\/project-details/);
  });

  it('notifications for the professional open the pro stack; the client\'s stays client', () => {
    // Two professional cases (engagement_completed, removal) and one client
    // case (end_date_soon).
    expect(NOTIFS.match(/'professional',\s*`\/\(professional\)\/chat\/project-details/g)?.length).toBe(2);
    expect(NOTIFS).not.toMatch(/'professional',\s*`\/\(client\)\/chat\/project-details/);
    expect(NOTIFS).toMatch(/'client',\s*`\/\(client\)\/chat\/project-details/);
  });

  it('the back arrow pops instead of pushing a copy of the chat', () => {
    expect(DETAILS).not.toMatch(/router\.push\(`\/\(client\)\/chat\/\$\{chatIdParam\}`/);
    expect(DETAILS).toMatch(/router\.canGoBack\(\)\s*\?\s*router\.back\(\)/);
  });
});

describe('driven through a real router, shaped like the app', () => {
  const routes = {
    _layout: () => <Slot />,
    '(client)/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
    '(client)/(tabs)/chats/index': () => <Text>CLIENT-LIST</Text>,
    '(client)/chat/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
    '(client)/chat/[chatId]': () => <Text>CLIENT-ROOM</Text>,
    '(client)/chat/project-details': () => <Text>PROJECT</Text>,
    '(professional)/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
    '(professional)/(tabs)/chats/index': () => <Text>PRO-LIST</Text>,
    '(professional)/chat/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
    '(professional)/chat/[chatId]': () => <Text>PRO-ROOM</Text>,
    '(professional)/chat/project-details': () => <Text>PROJECT</Text>,
  };

  it('from a pro chat, back from project details returns to that chat, then the list', () => {
    renderRouter(routes, { initialUrl: '/(professional)/(tabs)/chats' });
    act(() => { router.push('/(professional)/chat/abc'); });
    act(() => { router.push('/(professional)/chat/project-details?projectId=p1&chatId=abc'); });
    expect(screen.getByText('PROJECT')).toBeTruthy();

    act(() => { router.back(); });
    expect(screen.getByText('PRO-ROOM')).toBeTruthy();
    act(() => { router.back(); });
    expect(screen.getByText('PRO-LIST')).toBeTruthy();
  });
});
