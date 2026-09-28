import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import { ReportSheet } from '../ReportSheet';

/**
 * The one report pop-up: project details and both browse profiles show this
 * card, so they cannot drift apart again.
 */

jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/navigation/floatingTabBar', () => ({ useModeAccent: () => ({ accent: 'ACCENT', tint: 'TINT' }) }));
let mockLang = 'en';

function setup(over: Partial<React.ComponentProps<typeof ReportSheet>> = {}) {
  const props = {
    visible: true,
    name: 'Dana',
    reason: '',
    onReason: jest.fn(),
    evidence: [] as string[],
    onPickEvidence: jest.fn(),
    onRemoveEvidence: jest.fn(),
    submitting: false,
    onSubmit: jest.fn(),
    onClose: jest.fn(),
    ...over,
  };
  return { props, r: render(<ReportSheet {...props} />) };
}

beforeEach(() => { mockLang = 'en'; });

it('names who is reported, and takes the reason', () => {
  const { r, props } = setup();
  expect(r.getByText(en.report.title)).toBeTruthy();
  expect(r.getByText(en.report.reporting.replace('{{name}}', 'Dana'))).toBeTruthy();
  fireEvent.changeText(r.getByPlaceholderText(en.report.reason_placeholder), 'abc');
  expect(props.onReason).toHaveBeenCalledWith('abc');
});

it('submits only from 20 characters, in the mode colour', () => {
  const short = setup({ reason: 'too short' });
  expect(short.r.getByTestId('report-submit').props.accessibilityState.disabled).toBe(true);
  expect(short.r.getByText(en.report.min_chars)).toBeTruthy();
  const ok = setup({ reason: 'He kept messaging me after I asked him to stop.' });
  const btn = ok.r.getByTestId('report-submit');
  expect(btn.props.accessibilityState.disabled).toBe(false);
  expect(StyleSheet.flatten(btn.props.style).backgroundColor).toBe('ACCENT');
  fireEvent.press(btn);
  expect(ok.props.onSubmit).toHaveBeenCalled();
});

it('adds and removes evidence, up to three', () => {
  const { r, props } = setup({ evidence: ['file:///a.jpg'] });
  fireEvent.press(r.getByText(en.report.add_evidence));
  expect(props.onPickEvidence).toHaveBeenCalled();
  fireEvent.press(r.getByTestId('report-evidence-remove-0'));
  expect(props.onRemoveEvidence).toHaveBeenCalledWith(0);
  const full = setup({ evidence: ['a', 'b', 'c'] });
  fireEvent.press(full.r.getByText(en.report.add_evidence));
  expect(full.props.onPickEvidence).not.toHaveBeenCalled();
});

it('closes from the close icon and from the backdrop', () => {
  const { r, props } = setup();
  fireEvent.press(r.getByTestId('report-close'));
  fireEvent.press(r.getByTestId('report-backdrop'));
  expect(props.onClose).toHaveBeenCalledTimes(2);
});

it('mirrors in Hebrew', () => {
  mockLang = 'he';
  const { r } = setup();
  expect(StyleSheet.flatten(r.getByTestId('report-header').props.style).flexDirection).toBe('row-reverse');
});
