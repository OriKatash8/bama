import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';

/**
 * THE TERMS LINE READS AS ONE SENTENCE IN BOTH LANGUAGES.
 *
 * Hebrew attaches its prefixes: "לתנאי השימוש", "ולמדיניות הפרטיות" — the ל
 * and ו belong to the linked words, inside the links, with no space. English
 * keeps its spaces. Same line on the consent screen and on register.
 */

let mockLang = 'en';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }));
jest.mock('@core/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), setDoc: jest.fn() }));
jest.mock('firebase/auth', () => ({ deleteUser: jest.fn() }));
jest.mock('@core/firebase/functions', () => ({ callFunction: () => jest.fn() }));
jest.mock('@core/firebase/auth', () => ({ signOut: jest.fn() }));
jest.mock('@features/auth/utils/syncUser', () => ({ syncUser: jest.fn() }));
jest.mock('@features/auth/hooks/useRegister', () => ({ useRegister: () => ({ isLoading: false, error: null, register: jest.fn() }) }));
jest.mock('../GoogleSignInButton', () => ({ GoogleSignInButton: () => null }));
jest.mock('../AppleSignInButton', () => ({ AppleSignInButton: () => null }));
jest.mock('../AuthSettingsButton', () => ({ AuthSettingsButton: () => null }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ConsentForm } = require('../ConsentForm');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RegisterForm } = require('../RegisterForm');

/** The text of a Text node and its nested Text links, exactly as rendered. */
function textOf(n: ReactTestInstance | string): string {
  if (typeof n === 'string') return n;
  return (n.children as (ReactTestInstance | string)[]).map(textOf).join('');
}

/** The sentence that holds both links: the Text whose descendants carry onPress. */
function termsLine(r: ReturnType<typeof render>, termsLink: string) {
  const link = r.getByText(termsLink);
  let n: ReactTestInstance | null = link.parent;
  while (n && !(n.type === Text && n !== link && textOf(n).length > termsLink.length)) n = n.parent;
  return { line: textOf(n!), link };
}

describe.each([
  ['consent', ConsentForm],
  ['register', RegisterForm],
])('the %s screen', (_name, Form) => {
  it('Hebrew: the prefixes are attached, inside the links', () => {
    mockLang = 'he';
    const r = render(<Form />);
    const { line } = termsLine(r, 'לתנאי השימוש');
    expect(line).toBe('אני מסכים/ה לתנאי השימוש ולמדיניות הפרטיות');
    // Each prefix is part of its link, so tapping the whole word opens it.
    expect(r.getByText('לתנאי השימוש').props.onPress).toEqual(expect.any(Function));
    expect(r.getByText('ולמדיניות הפרטיות').props.onPress).toEqual(expect.any(Function));
  });

  it('English still reads correctly', () => {
    mockLang = 'en';
    const r = render(<Form />);
    const { line } = termsLine(r, 'Terms of Service');
    expect(line).toBe('I agree to the Terms of Service and Privacy Policy');
    expect(r.getByText('Privacy Policy').props.onPress).toEqual(expect.any(Function));
  });
});
