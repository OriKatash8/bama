import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { ToastContainer, ADMIN_TOAST_BOTTOM } from '../Toast';
import { useUiStore } from '@core/stores/uiStore';
import { FLOATING_TAB_BAR_BOTTOM, TAB_BAR_CONTENT_HEIGHT } from '@core/navigation/floatingTabBar';

/**
 * A toast ("Saved") sat at 80 from the bottom everywhere, which on the admin pages is on top of the
 * floating tab bar. On the admin routes it is lifted clear of it; elsewhere it is unchanged.
 */
let mockSegments: string[] = [];
jest.mock('expo-router', () => ({ useSegments: () => mockSegments }));

beforeEach(() => {
  mockSegments = [];
  act(() => { useUiStore.setState({ toasts: [{ id: 't1', message: 'Saved', type: 'success' }] } as never); });
});

const bottomOf = (r: ReturnType<typeof render>) =>
  StyleSheet.flatten(r.getByTestId('toast-container').props.style).bottom;

it('sits at 80 on a normal screen', () => {
  mockSegments = ['(client)', '(tabs)', 'home'];
  expect(bottomOf(render(<ToastContainer />))).toBe(80);
});

it('is lifted clear of the floating tab bar on the admin routes', () => {
  mockSegments = ['admin', 'fees'];
  const bottom = bottomOf(render(<ToastContainer />));
  expect(bottom).toBe(ADMIN_TOAST_BOTTOM);
  expect(bottom).toBeGreaterThanOrEqual(FLOATING_TAB_BAR_BOTTOM + TAB_BAR_CONTENT_HEIGHT);
  expect(bottom).toBeGreaterThan(80);
});
