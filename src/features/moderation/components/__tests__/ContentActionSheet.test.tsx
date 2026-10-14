import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { ContentActionSheet } from '../ContentActionSheet';

/** The labelled Report / Block menu behind a message long-press and the chat header. */

let mockLang = 'en';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));

function setup(over: Partial<React.ComponentProps<typeof ContentActionSheet>> = {}) {
  const props = {
    visible: true,
    subjectName: 'Dana',
    reportKind: 'message' as const,
    onClose: jest.fn(),
    onReport: jest.fn(),
    onBlock: jest.fn(),
    ...over,
  };
  return { props, ...render(<ContentActionSheet {...props} />) };
}

beforeEach(() => { mockLang = 'en'; });

describe('ContentActionSheet', () => {
  it('offers Report message and Block user, closing before it acts', () => {
    const { props, getByText, getByTestId } = setup();
    expect(getByText('Dana')).toBeTruthy();
    expect(getByText(en.moderation.report_message)).toBeTruthy();
    fireEvent.press(getByTestId('content-action-report'));
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onReport).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId('content-action-block'));
    expect(props.onBlock).toHaveBeenCalledTimes(1);
  });

  it('shows Reply only when there is a message to reply to', () => {
    expect(setup().queryByTestId('content-action-reply')).toBeNull();
    const onReply = jest.fn();
    const { getByTestId } = setup({ onReply });
    fireEvent.press(getByTestId('content-action-reply'));
    expect(onReply).toHaveBeenCalledTimes(1);
  });

  it('says "Report user" for the header menu, in Hebrew too', () => {
    expect(setup({ reportKind: 'user' }).getByText(en.moderation.report_user)).toBeTruthy();
    mockLang = 'he';
    expect(setup({ reportKind: 'user' }).getByText(he.moderation.block_user)).toBeTruthy();
  });
});
