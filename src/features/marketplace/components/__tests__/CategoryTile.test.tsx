import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { CategoryTile } from '../CategoryTile';

/**
 * A marketplace category tile shows its coloured icon when chosen. Both icons
 * are always mounted and the chosen one is shown by opacity: swapping one
 * image's `source` did not repaint on phones (expo-image), only on web.
 */

const cat = { id: 'lens', labelKey: 'category_lens', icon: 101, selectedIcon: 202 };

const layers = (r: ReturnType<typeof render>) => ({
  plain: StyleSheet.flatten(r.getByTestId('cat-lens-icon').props.style),
  colour: StyleSheet.flatten(r.getByTestId('cat-lens-icon-selected').props.style),
});

it('not chosen: the plain icon shows, the coloured one is hidden', () => {
  const r = render(<CategoryTile cat={cat} label="Lenses" isActive={false} onPress={jest.fn()} inactiveLabelColor="#000" />);
  const { plain, colour } = layers(r);
  expect(plain.opacity).toBe(1);
  expect(colour.opacity).toBe(0);
});

it('chosen: the coloured icon shows, the plain one is hidden — both stay mounted', () => {
  const r = render(<CategoryTile cat={cat} label="Lenses" isActive onPress={jest.fn()} inactiveLabelColor="#000" />);
  const { plain, colour } = layers(r);
  expect(colour.opacity).toBe(1);
  expect(plain.opacity).toBe(0);
});

it('choosing it flips the icons without changing either image source', () => {
  const r = render(<CategoryTile cat={cat} label="Lenses" isActive={false} onPress={jest.fn()} inactiveLabelColor="#000" />);
  const before = [r.getByTestId('cat-lens-icon').props.source, r.getByTestId('cat-lens-icon-selected').props.source];
  r.rerender(<CategoryTile cat={cat} label="Lenses" isActive onPress={jest.fn()} inactiveLabelColor="#000" />);
  expect(layers(r).colour.opacity).toBe(1);
  expect(layers(r).plain.opacity).toBe(0);
  // Neither image is asked to load anything new — only their opacity changed.
  expect(r.getByTestId('cat-lens-icon').props.source).toEqual(before[0]);
  expect(r.getByTestId('cat-lens-icon-selected').props.source).toEqual(before[1]);
});

it('a tile without a coloured icon just shows its icon', () => {
  const r = render(<CategoryTile cat={{ ...cat, selectedIcon: undefined }} label="Lenses" isActive onPress={jest.fn()} inactiveLabelColor="#000" />);
  expect(StyleSheet.flatten(r.getByTestId('cat-lens-icon').props.style).opacity).toBe(1);
  expect(r.queryByTestId('cat-lens-icon-selected')).toBeNull();
});

it('tapping it calls onPress', () => {
  const onPress = jest.fn();
  const r = render(<CategoryTile cat={cat} label="Lenses" isActive={false} onPress={onPress} inactiveLabelColor="#000" />);
  fireEvent.press(r.getByText('Lenses'));
  expect(onPress).toHaveBeenCalled();
});

// "Studio Accessories" wraps to two lines in the 82pt tile; each line must
// centre under the icon, chosen or not.
it('a two-line label is centred under the icon', () => {
  for (const isActive of [false, true]) {
    const r = render(<CategoryTile cat={cat} label="Studio Accessories" isActive={isActive} onPress={jest.fn()} inactiveLabelColor="#000" />);
    expect(StyleSheet.flatten(r.getByText('Studio Accessories').props.style).textAlign).toBe('center');
  }
});
