import React from 'react';
import { Pressable, Text } from 'react-native';
import { renderRouter, act, screen, fireEvent } from 'expo-router/testing-library';
import { Slot, Stack, Tabs, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { projectDetailsBack } from '@features/chat/utils/projectDetailsBack';

/**
 * PROJECT DETAILS' BACK ARROW RETURNS TO THE PROJECT'S CHAT — even when the
 * chat is not underneath it. A notification (end date soon, removal, a
 * finished engagement) or the dashboard's slot sheet opens project details
 * straight from a tab, so a plain pop landed on that tab — the home page —
 * instead of the chat.
 */

function Details() {
  const { chatId } = useLocalSearchParams<{ chatId?: string }>();
  const navigation = useNavigation();
  return (
    <Pressable
      testID="back"
      onPress={() => {
        const to = projectDetailsBack(navigation.getState(), chatId, '(client)');
        if (to) router.replace(to as never);
        else if (router.canGoBack()) router.back();
        else router.replace('/(client)/(tabs)/chats');
      }}
    >
      <Text>PROJECT</Text>
    </Pressable>
  );
}

const routes = {
  _layout: () => <Slot />,
  '(client)/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
  '(client)/(tabs)/_layout': () => <Tabs />,
  '(client)/(tabs)/home/index': () => <Text>HOME</Text>,
  '(client)/(tabs)/chats/index': () => <Text>CLIENT-LIST</Text>,
  '(client)/chat/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
  '(client)/chat/[chatId]': () => {
    const { chatId } = useLocalSearchParams<{ chatId: string }>();
    return <Text>{`ROOM-${chatId}`}</Text>;
  },
  '(client)/chat/project-details': Details,
};

it('opened from the chat: back pops to that chat', () => {
  renderRouter(routes, { initialUrl: '/(client)/(tabs)/chats' });
  act(() => { router.push('/(client)/chat/abc'); });
  act(() => { router.push('/(client)/chat/project-details?projectId=p1&chatId=abc'); });

  fireEvent.press(screen.getByTestId('back'));
  expect(screen.getByText('ROOM-abc')).toBeTruthy();
  act(() => { router.back(); });
  expect(screen.getByText('CLIENT-LIST')).toBeTruthy();
});

it('opened from the home tab (a notification): back goes to the chat, not home', () => {
  renderRouter(routes, { initialUrl: '/(client)/(tabs)/home' });
  act(() => { router.push('/(client)/chat/project-details?projectId=p1&chatId=abc'); });

  fireEvent.press(screen.getByTestId('back'));
  expect(screen.getByText('ROOM-abc')).toBeTruthy();
});

it('a different chat underneath is not this project\'s chat', () => {
  renderRouter(routes, { initialUrl: '/(client)/(tabs)/chats' });
  act(() => { router.push('/(client)/chat/other'); });
  act(() => { router.push('/(client)/chat/project-details?projectId=p1&chatId=abc'); });

  fireEvent.press(screen.getByTestId('back'));
  expect(screen.getByText('ROOM-abc')).toBeTruthy();
});

it('with no chat id: pops as before', () => {
  renderRouter(routes, { initialUrl: '/(client)/(tabs)/home' });
  act(() => { router.push('/(client)/chat/project-details?projectId=p1'); });

  fireEvent.press(screen.getByTestId('back'));
  expect(screen.getByText('HOME')).toBeTruthy();
});
