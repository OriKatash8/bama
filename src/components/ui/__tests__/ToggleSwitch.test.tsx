import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { ToggleSwitch } from '../ToggleSwitch';

/**
 * RN's Switch cannot give the OFF track a border, and iOS and web fill it
 * differently — which is how the community mute toggle ended up invisible when
 * off. This toggle draws both states itself so they look the same everywhere.
 */

jest.mock('@core/hooks/useTheme', () => ({
  useTheme: () => ({ primary: '#004aad' }),
}));

function trackStyle(r: ReturnType<typeof render>) {
  return StyleSheet.flatten(r.getByTestId('toggle-track').props.style);
}

it('draws the OFF track as a filled grey track with a visible border', () => {
  const r = render(<ToggleSwitch value={false} onValueChange={jest.fn()} />);
  const style = trackStyle(r);
  expect(style.backgroundColor).toBeTruthy();
  expect(style.backgroundColor).not.toBe('transparent');
  expect(style.backgroundColor).not.toBe('#004aad');
  expect(style.borderWidth).toBeGreaterThan(0);
  expect(style.borderColor).toBeTruthy();
});

it('fills the ON track with the primary colour', () => {
  const r = render(<ToggleSwitch value onValueChange={jest.fn()} />);
  expect(trackStyle(r).backgroundColor).toBe('#004aad');
});

it('reports the flipped value when pressed, and exposes switch semantics', () => {
  const onValueChange = jest.fn();
  const r = render(<ToggleSwitch value={false} onValueChange={onValueChange} accessibilityLabel="Mute" />);
  const sw = r.getByRole('switch', { name: 'Mute' });
  expect(sw.props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
  fireEvent.press(sw);
  expect(onValueChange).toHaveBeenCalledWith(true);
});

it('does nothing when disabled', () => {
  const onValueChange = jest.fn();
  const r = render(<ToggleSwitch value={false} onValueChange={onValueChange} disabled />);
  fireEvent.press(r.getByRole('switch'));
  expect(onValueChange).not.toHaveBeenCalled();
});
