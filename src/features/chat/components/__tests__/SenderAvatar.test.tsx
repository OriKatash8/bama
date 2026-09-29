import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { SenderAvatar } from '../SenderAvatar';

/**
 * The sender's picture beside someone else's bubble: their photo, or the first
 * letter of their name on their colour — the same colour as their name above
 * the bubble.
 */

it('shows the photo when there is one', () => {
  const r = render(<SenderAvatar photoURL="https://x/p.jpg" name="Dana" color="#e53935" />);
  expect([r.getByTestId('sender-avatar-photo').props.source].flat()).toEqual([{ uri: 'https://x/p.jpg' }]);
  expect(r.queryByText('D')).toBeNull();
});

it('caches the photo in memory and on disk, as the chat list does', () => {
  const r = render(<SenderAvatar photoURL="https://x/p.jpg" name="Dana" color="#e53935" />);
  expect(r.getByTestId('sender-avatar-photo').props.cachePolicy).toBe('memory-disk');
});

it('falls back to the initial on the sender\'s colour', () => {
  const r = render(<SenderAvatar photoURL={null} name="dana" color="#e53935" />);
  expect(r.getByText('D')).toBeTruthy();
  expect(StyleSheet.flatten(r.getByTestId('sender-avatar').props.style).backgroundColor).toBe('#e53935');
});

it('an unknown name still leaves a circle, not a crash', () => {
  const r = render(<SenderAvatar photoURL={null} name="" color="#e53935" />);
  expect(r.getByTestId('sender-avatar')).toBeTruthy();
});

it('opens the profile when tappable', () => {
  const onPress = jest.fn();
  const r = render(<SenderAvatar photoURL={null} name="Dana" color="#e53935" onPress={onPress} />);
  fireEvent.press(r.getByTestId('sender-avatar'));
  expect(onPress).toHaveBeenCalled();
});
