import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { AppText } from '../AppText';

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;

describe('AppText font', () => {
  it('draws Latin text in the static Montserrat face for its weight, with no fontWeight', () => {
    const r = render(<AppText weight="bold">Hello</AppText>);
    const s = flat(r.getByText('Hello'));
    expect(s.fontFamily).toBe('Montserrat-Bold');
    expect(s.fontWeight).toBeUndefined();
  });

  it('draws Hebrew in the static Heebo face', () => {
    const r = render(<AppText weight="semiBold">שלום</AppText>);
    expect(flat(r.getByText('שלום')).fontFamily).toBe('Heebo-SemiBold');
  });

  it("cancels a fontWeight in the caller's style (the weight is in the family; Android would add synthetic bold)", () => {
    const r = render(<AppText style={{ fontWeight: '800' }}>Hello</AppText>);
    const s = flat(r.getByText('Hello'));
    expect(s.fontFamily).toBe('Montserrat-Regular');
    expect(s.fontWeight).toBeUndefined();
  });
});
