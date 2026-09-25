import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text } from 'react-native';
import { renderRouter, act, screen } from 'expo-router/testing-library';
import { Slot, Stack, router } from 'expo-router';

/**
 * COMMUNITY DETAILS OPENS IN THE VIEWER'S OWN STACK.
 *
 * The app root is a Slot, and (client) and (professional) are two separate
 * stacks under it. Details used to exist only at (client)/chat/community-details,
 * and the chat room pushed that path in both modes — so from a PRO chat, opening
 * details jumped into the client stack. There it had no chat underneath: back
 * landed on that stack's own tabs (the communities list), and there was nothing
 * to swipe back to. An earlier "fix" pushed a client-side copy of the chat from
 * details, which only hid it and made the swipe out of that copy land on details.
 */

const APP = join(__dirname, '..', '..', '..', '..', 'app');
const ROOM_SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');
const DETAILS_SRC = readFileSync(join(APP, '(client)', 'chat', 'community-details.tsx'), 'utf8');
const ADMIN_SRC = readFileSync(join(__dirname, '..', '..', '..', 'communityAdmin', 'CommunityAdminScreen.tsx'), 'utf8');

describe('route files', () => {
  it.each(['community-details', 'community-admin'])('%s exists in the pro chat stack too', (name) => {
    expect(() => readFileSync(join(APP, '(professional)', 'chat', `${name}.tsx`))).not.toThrow();
  });
});

describe('no screen in the community flow hard-codes the client stack', () => {
  it('the chat room opens details in the viewer\'s group', () => {
    expect(ROOM_SRC).not.toMatch(/\/\(client\)\/chat\/community-details/);
    expect(ROOM_SRC).toMatch(/\/\$\{chatGroup\}\/chat\/community-details\?chatId=/);
  });

  it('details opens the dashboard, and falls back to the room, in the viewer\'s group', () => {
    expect(DETAILS_SRC).not.toMatch(/\/\(client\)\/chat\//);
  });

  it('the dashboard links back to details in the viewer\'s group', () => {
    expect(ADMIN_SRC).not.toMatch(/\/\(client\)\/chat\/community-details/);
  });
});

describe('driven through a real router, shaped like the app', () => {
  const routes = {
    _layout: () => <Slot />,
    '(client)/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
    '(client)/(tabs)/chats/index': () => <Text>CLIENT-LIST</Text>,
    '(client)/chat/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
    '(client)/chat/[chatId]': () => <Text>CLIENT-ROOM</Text>,
    '(client)/chat/community-details': () => <Text>DETAILS</Text>,
    '(professional)/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
    '(professional)/(tabs)/chats/index': () => <Text>PRO-LIST</Text>,
    '(professional)/chat/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
    '(professional)/chat/[chatId]': () => <Text>PRO-ROOM</Text>,
    '(professional)/chat/community-details': () => <Text>DETAILS</Text>,
  };

  it('from a pro chat, back from details returns to that chat', () => {
    renderRouter(routes, { initialUrl: '/(professional)/(tabs)/chats' });
    act(() => { router.push('/(professional)/chat/abc'); });
    act(() => { router.push('/(professional)/chat/community-details?chatId=abc'); });
    expect(screen.getByText('DETAILS')).toBeTruthy();

    act(() => { router.back(); });
    expect(screen.getByText('PRO-ROOM')).toBeTruthy();

    act(() => { router.back(); });
    expect(screen.getByText('PRO-LIST')).toBeTruthy();
  });

  it('would have caught the old path: the client route from a pro chat never returns to it', () => {
    renderRouter(routes, { initialUrl: '/(professional)/(tabs)/chats' });
    act(() => { router.push('/(professional)/chat/abc'); });
    act(() => { router.push('/(client)/chat/community-details?chatId=abc'); });
    act(() => { if (router.canGoBack()) router.back(); });
    expect(screen.queryByText('PRO-ROOM')).toBeNull();
  });
});
