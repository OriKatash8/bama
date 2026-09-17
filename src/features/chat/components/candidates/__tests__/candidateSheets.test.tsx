import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';

jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (sel: (s: { language: string }) => unknown) => sel({ language: 'en' }),
}));

import { RejectCandidateSheet, REJECT_REASON_MAX } from '../RejectCandidateSheet';
import { PriceChangeSheet, isProposedPriceValid } from '../PriceChangeSheet';

const disabled = (el: { props: { accessibilityState?: { disabled?: boolean } } }) => !!el.props.accessibilityState?.disabled;

describe('RejectCandidateSheet', () => {
  it('caps the reason at the server bound and trims it', async () => {
    const onConfirm = jest.fn();
    const { getByTestId } = render(<RejectCandidateSheet visible name="Avi" submitting={false} onConfirm={onConfirm} onClose={jest.fn()} />);
    expect(getByTestId('reject-reason-input').props.maxLength).toBe(REJECT_REASON_MAX);
    expect(REJECT_REASON_MAX).toBe(500);
    fireEvent.changeText(getByTestId('reject-reason-input'), '  late  ');
    await act(async () => { fireEvent.press(getByTestId('reject-confirm')); });
    expect(onConfirm).toHaveBeenCalledWith('late');
  });

  it('confirm is disabled while submitting', () => {
    const { getByTestId } = render(<RejectCandidateSheet visible name="Avi" submitting onConfirm={jest.fn()} onClose={jest.fn()} />);
    expect(disabled(getByTestId('reject-confirm'))).toBe(true);
  });
});

describe('PriceChangeSheet', () => {
  const editor = { key: 'category:Editor', label: 'Editor', amount: 500, category: 'Editor' };
  const bundle = { key: 'bundle:b1', label: 'Editor · Sound', amount: 900, bundleId: 'b1' };

  it('bounds match the server: 1–50000', () => {
    expect(isProposedPriceValid('0')).toBe(false);
    expect(isProposedPriceValid('1')).toBe(true);
    expect(isProposedPriceValid('50000')).toBe(true);
    expect(isProposedPriceValid('50001')).toBe(false);
    expect(isProposedPriceValid('')).toBe(false);
  });

  it('one role is preselected and an out-of-range amount cannot be sent', async () => {
    const onSubmit = jest.fn();
    const { getByTestId, queryByTestId } = render(<PriceChangeSheet visible name="Avi" roles={[editor]} submitting={false} onSubmit={onSubmit} onClose={jest.fn()} />);
    await act(async () => {});
    fireEvent.changeText(getByTestId('price-amount-input'), '50001');
    expect(getByTestId('price-amount-error')).toBeTruthy();
    expect(disabled(getByTestId('price-send'))).toBe(true);
    fireEvent.changeText(getByTestId('price-amount-input'), '450');
    expect(queryByTestId('price-amount-error')).toBeNull();
    await act(async () => { fireEvent.press(getByTestId('price-send')); });
    expect(onSubmit).toHaveBeenCalledWith(editor, 450, '');
  });

  it('several roles: nothing is sent until one is picked, and a bundle keeps its bundleId', async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(<PriceChangeSheet visible name="Avi" roles={[editor, bundle]} submitting={false} onSubmit={onSubmit} onClose={jest.fn()} />);
    await act(async () => {});
    fireEvent.changeText(getByTestId('price-amount-input'), '800');
    expect(disabled(getByTestId('price-send'))).toBe(true);
    fireEvent.press(getByTestId('price-role-bundle:b1'));
    await act(async () => { fireEvent.press(getByTestId('price-send')); });
    expect(onSubmit).toHaveBeenCalledWith(bundle, 800, '');
  });
});
