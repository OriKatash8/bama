import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PriceOfferCard } from '../PriceOfferCard';
import en from '@core/i18n/translations/en.json';
import type { PriceOffer } from '@core/types/project';

/**
 * Accepting an offer must lock every OTHER offer's Accept button too, not just the
 * one that was tapped.
 *
 * `hireProfessional` creates the project's group chat on the first hire. Two
 * accepts that overlap both see no chat yet and each create one, leaving the client
 * with two chats for one project. One professional sending two offers on the same
 * project is what makes this reachable: both cards render an Accept button, and the
 * second tap lands while the first call is still in flight.
 *
 * The server is the real fix (the hire now commits in a transaction). This closes
 * the window that makes it easy to hit.
 */

jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));

const offer = {
  id: 'o1',
  projectId: 'p1',
  professionalId: 'pro1',
  category: 'photographer',
  price: 500,
  status: 'pending',
} as unknown as PriceOffer;

function setup(props: { isAccepting?: boolean; busy?: boolean } = {}) {
  const onAccept = jest.fn();
  const r = render(
    <PriceOfferCard
      offer={offer}
      onPressProfile={jest.fn()}
      onAccept={onAccept}
      onReject={jest.fn()}
      isAccepting={props.isAccepting ?? false}
      busy={props.busy ?? false}
    />,
  );
  return { r, onAccept };
}

it('accepts normally when nothing is in flight', () => {
  const { r, onAccept } = setup();
  fireEvent.press(r.getByText(en.offers.accept));
  expect(onAccept).toHaveBeenCalled();
});

it('refuses a second accept while another offer is still being accepted', () => {
  // busy = some OTHER card is mid-hire. This card is not the one spinning.
  const { r, onAccept } = setup({ isAccepting: false, busy: true });
  fireEvent.press(r.getByText(en.offers.accept));
  expect(onAccept).not.toHaveBeenCalled();
});

it('shows the spinner only on the card actually being accepted', () => {
  // The other cards go inert, but they must not all look like they are working
  expect(setup({ isAccepting: false, busy: true }).r.queryByText(en.offers.accept)).toBeTruthy();
  expect(setup({ isAccepting: true, busy: true }).r.queryByText(en.offers.accept)).toBeNull();
});
