import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ReviewFlow } from '../ReviewFlow';
import { submitReviews } from '@features/reviews/services/submitReviews';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * The comment is optional: a star rating alone submits the review. The old
 * 10-character minimum is gone, the placeholder says the comment is optional,
 * and the input is capped at the 1000 characters the rules allow.
 */

jest.mock('@features/reviews/services/submitReviews', () => ({
  submitReviews: jest.fn(async () => ({ written: ['p1'], failed: [] })),
}));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('lucide-react-native', () => ({ Star: () => null, User: () => null }));
jest.mock('@core/hooks/useAppFont', () => ({ useAppFont: () => ({ regular: {}, bold: {} }) }));
let mockLang: 'he' | 'en' = 'en';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));

const pro = { id: 'p1', displayName: 'Pro One', photoURL: null, role: 'editor' };
const props = {
  visible: true, projectId: 'proj', clientId: 'c1', clientDisplayName: 'Client',
  professionals: [pro], onComplete: jest.fn(),
};

beforeEach(() => { jest.clearAllMocks(); mockLang = 'en'; jest.spyOn(console, 'log').mockImplementation(() => {}); });

function submitButton(utils: ReturnType<typeof render>) {
  return utils.getByText(en.review.submit);
}

it('submit is disabled until a star is chosen', () => {
  const utils = render(<ReviewFlow {...props} />);
  fireEvent.press(submitButton(utils));
  expect(submitReviews).not.toHaveBeenCalled();
});

it('stars alone submit the review, with an empty comment', async () => {
  const utils = render(<ReviewFlow {...props} />);
  fireEvent.press(utils.getByTestId('review-star-4'));
  fireEvent.press(submitButton(utils));
  await waitFor(() => expect(submitReviews).toHaveBeenCalledTimes(1));
  expect((submitReviews as jest.Mock).mock.calls[0][0].reviews).toEqual([{ professionalId: 'p1', rating: 4, text: '' }]);
});

it('a short comment no longer blocks submission and shows no length hint', async () => {
  const utils = render(<ReviewFlow {...props} />);
  fireEvent.press(utils.getByTestId('review-star-5'));
  fireEvent.changeText(utils.getByPlaceholderText(en.review.placeholder), 'ok');
  expect(utils.queryByText(/at least 10/)).toBeNull();
  fireEvent.press(submitButton(utils));
  await waitFor(() => expect(submitReviews).toHaveBeenCalledTimes(1));
});

it('the input says the comment is optional and is capped at 1000 characters', () => {
  const utils = render(<ReviewFlow {...props} />);
  const input = utils.getByPlaceholderText('Want to add a few words? (optional)');
  expect(input.props.maxLength).toBe(1000);
});

it('the Hebrew placeholder says the comment is optional', () => {
  mockLang = 'he';
  const utils = render(<ReviewFlow {...props} />);
  expect(utils.getByPlaceholderText(he.review.placeholder)).toBeTruthy();
  expect(he.review.placeholder).toBe('רוצה להוסיף כמה מילים? (לא חובה)');
});
