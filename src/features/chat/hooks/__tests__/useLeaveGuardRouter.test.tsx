import React from 'react';
import { Text } from 'react-native';
import { renderRouter, act, screen } from 'expo-router/testing-library';
import { Stack, router } from 'expo-router';

/**
 * The guard against the real navigator, not a mock: back must be intercepted when the room is
 * a screen of a NESTED stack (the chat flow is a stack whose OUTER route an edge swipe pops),
 * not only when the screen itself is the one removed.
 */

const mockConfirm = jest.fn();
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: (...a: unknown[]) => mockConfirm(...a) }));

import { useLeaveGuard } from '../useLeaveGuard';

const onLeave = jest.fn();
let sending = true;

function Room() {
  useLeaveGuard(sending, { title: 'T', message: 'M', leave: 'Leave', stay: 'Stay' }, onLeave);
  return <Text>room</Text>;
}

function mount() {
  renderRouter(
    {
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      index: () => <Text>home</Text>,
      'chat/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
      'chat/room': Room,
    },
    { initialUrl: '/' },
  );
}

async function goRoomThenBack() {
  await act(async () => { router.push('/chat/room'); });
  expect(screen.getByText('room')).toBeTruthy();
  await act(async () => { router.back(); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => { jest.clearAllMocks(); sending = true; });

it('Stay: back is blocked, the room stays', async () => {
  mockConfirm.mockResolvedValue(false);
  mount();
  await goRoomThenBack();
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(screen.getByText('room')).toBeTruthy();
  expect(onLeave).not.toHaveBeenCalled();
});

it('Leave: the send is cancelled and the back goes through', async () => {
  mockConfirm.mockResolvedValue(true);
  mount();
  await goRoomThenBack();
  expect(onLeave).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('room')).toBeNull();
  expect(screen.getByText('home')).toBeTruthy();
});

it('nothing sending: back goes through with no dialog', async () => {
  sending = false;
  mount();
  await goRoomThenBack();
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(screen.getByText('home')).toBeTruthy();
});
