import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { SubmitCourseModal } from '../SubmitCourseModal';
import he from '@core/i18n/translations/he.json';
import { ROLE_CATEGORIES, categoryLabel } from '@features/crew/data/categories';

/**
 * Every line of Hebrew in "add your course" reads right-to-left.
 *
 * The inputs and the rows already flipped, but the TEXT inside them did not:
 * the title, every field label and the category list were left-aligned, so the
 * form read as a column of Hebrew hugging the wrong edge.
 *
 * Asserted as an INVARIANT over the whole tree rather than label by label —
 * this form has ten fields and will grow. Anything Hebrew must carry an
 * explicit alignment, and it must be 'right' (a label) or 'center' (a button).
 * An absent alignment fails: it is the default, and the default is left.
 */

jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(), MediaTypeOptions: { Images: 'Images' },
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), addDoc: jest.fn(), serverTimestamp: jest.fn(),
}));
jest.mock('@core/firebase/config', () => ({ db: {} }));
jest.mock('@core/firebase/storage', () => ({ uploadFile: jest.fn() }));
let mockLanguage = 'he';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLanguage }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string; displayName: string } }) => unknown) =>
    s({ user: { id: 'u1', displayName: 'Ori' } }),
}));

const HEBREW = /[֐-׿]/;

/** The right-to-left mark rtlSafe appends. JSON.stringify leaves it literal. */
const RLM = '‏';

type Node = { type?: string; props?: { style?: unknown }; children?: unknown };

/** Every rendered Text whose content contains Hebrew, with its flattened style. */
function hebrewTexts(node: unknown, out: { text: string; align: unknown }[] = []) {
  if (Array.isArray(node)) { node.forEach((n) => hebrewTexts(n, out)); return out; }
  if (!node || typeof node !== 'object') return out;
  const n = node as Node;
  const kids = n.children;
  if (n.type === 'Text') {
    const text = JSON.stringify(kids ?? '');
    if (HEBREW.test(text)) {
      const style = StyleSheet.flatten(n.props?.style as never) as Record<string, unknown> | undefined;
      out.push({ text, align: style?.textAlign });
    }
  }
  hebrewTexts(kids, out);
  return out;
}

function renderModal(language: 'he' | 'en') {
  mockLanguage = language;
  return render(<SubmitCourseModal visible onClose={jest.fn()} onSubmitted={jest.fn()} />);
}

describe('Hebrew', () => {
  it('aligns every Hebrew line right, or centres it in a button', () => {
    const texts = hebrewTexts(renderModal('he').toJSON());

    // The form really rendered — otherwise an empty list passes vacuously.
    expect(texts.length).toBeGreaterThan(8);

    const wrong = texts.filter((t) => t.align !== 'right' && t.align !== 'center');
    expect(wrong.map((w) => `${w.text} -> ${String(w.align)}`)).toEqual([]);
  });

  it('puts the title and the field labels on the right, not merely centred', () => {
    // The stronger half: 'center' is allowed above only for buttons, so pin the
    // ones that must genuinely be right-aligned.
    const texts = hebrewTexts(renderModal('he').toJSON());
    for (const label of [he.courses.add_your_course, he.courses.course_title_label, he.courses.course_category]) {
      const match = texts.find((t) => t.text.includes(label));
      expect(match).toBeDefined();
      expect(match!.align).toBe('right');
    }
  });

  it('keeps the required marker on the Hebrew side of the label', () => {
    // The app lays out LTR, so a trailing "*" after Hebrew falls to the LTR end
    // — the right — landing in front of the words instead of after them. An RTL
    // mark anchors it (rtlSafe).
    const texts = hebrewTexts(renderModal('he').toJSON());
    const required = texts.filter((t) => t.text.includes('*'));
    expect(required.length).toBeGreaterThan(0);
    for (const t of required) expect(t.text).toContain(RLM);
  });
});

describe('the chosen category', () => {
  it('reads back in Hebrew, not in the stored English key', () => {
    // The list offers localised names but the button echoed `category`, which
    // is the raw ROLE_CATEGORIES key the document is saved under. Picking one
    // left an English word sitting in the middle of a Hebrew form.
    const r = renderModal('he');
    fireEvent.press(r.getByText(he.courses.select_category));

    const hebrewName = categoryLabel(ROLE_CATEGORIES[0], 'he');
    fireEvent.press(r.getAllByText(hebrewName)[0]);

    expect(r.queryByText(ROLE_CATEGORIES[0])).toBeNull();
    expect(r.getAllByText(hebrewName).length).toBeGreaterThan(0);
  });
});

describe('English is untouched', () => {
  it('aligns the title left and adds no direction marks', () => {
    // The anchor: without it, hardcoding 'right' everywhere would satisfy the
    // whole file above.
    const r = renderModal('en');
    const title = r.getByText('Add Your Course');
    expect((StyleSheet.flatten(title.props.style) as Record<string, unknown>).textAlign).toBe('left');
    expect(JSON.stringify(r.toJSON())).not.toContain(RLM);
  });
});
