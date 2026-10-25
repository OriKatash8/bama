import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { useSettingsStore } from '@core/stores/settingsStore';
import { Text, TextInput } from '../Text';

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;

beforeEach(() => useSettingsStore.setState({ language: 'en' }));

describe('Text', () => {
  it('defaults plain text to the regular face of its script', () => {
    const r = render(<><Text>Hello</Text><Text>שלום</Text></>);
    expect(flat(r.getByText('Hello')).fontFamily).toBe('Montserrat-Regular');
    expect(flat(r.getByText('שלום')).fontFamily).toBe('Heebo-Regular');
  });

  it('turns fontWeight into the matching static family and drops the weight', () => {
    const r = render(<Text style={{ fontWeight: '700', color: 'red' }}>Hello</Text>);
    const s = flat(r.getByText('Hello'));
    expect(s.fontFamily).toBe('Montserrat-Bold');
    expect(s.fontWeight).toBeUndefined();
    expect(s.color).toBe('red');
  });

  it('keeps an explicit brand family and lets a weight pick its face', () => {
    const r = render(<Text style={{ fontFamily: 'Montserrat-Bold', fontWeight: '800' }}>Hello</Text>);
    expect(flat(r.getByText('Hello')).fontFamily).toBe('Montserrat-ExtraBold');
  });

  it('never touches another font', () => {
    const r = render(<Text style={{ fontFamily: 'PeaceSans', fontWeight: '700' }}>Hello</Text>);
    const s = flat(r.getByText('Hello'));
    expect(s.fontFamily).toBe('PeaceSans');
    expect(s.fontWeight).toBe('700');
  });

  it('a nested span inherits its parent unless it sets its own face', () => {
    const r = render(<Text style={{ fontWeight: '700' }}>Bold <Text testID="plain">inherits</Text> <Text testID="own" style={{ fontWeight: '500' }}>medium</Text></Text>);
    expect(flat(r.getByTestId('plain')).fontFamily).toBeUndefined();
    expect(flat(r.getByTestId('own')).fontFamily).toBe('Montserrat-Medium');
  });

  it('reads Hebrew in a nested element for the outer face', () => {
    const r = render(<Text testID="outer"><Text>שלום</Text></Text>);
    expect(flat(r.getByTestId('outer')).fontFamily).toBe('Heebo-Regular');
  });
});

describe('TextInput', () => {
  it('reads the script from the placeholder or value in English UI', () => {
    const r = render(<><TextInput testID="a" placeholder="Search" /><TextInput testID="b" value="שלום" onChangeText={() => {}} /></>);
    expect(flat(r.getByTestId('a')).fontFamily).toBe('Montserrat-Regular');
    expect(flat(r.getByTestId('b')).fontFamily).toBe('Heebo-Regular');
  });

  it('uses Heebo in Hebrew UI, since it covers Latin too', () => {
    useSettingsStore.setState({ language: 'he' });
    const r = render(<TextInput testID="a" placeholder="Search" />);
    expect(flat(r.getByTestId('a')).fontFamily).toBe('Heebo-Regular');
  });

  it('applies a weight as a family', () => {
    const r = render(<TextInput testID="a" placeholder="x" style={{ fontWeight: '600' }} />);
    const s = flat(r.getByTestId('a'));
    expect(s.fontFamily).toBe('Montserrat-SemiBold');
    expect(s.fontWeight).toBeUndefined();
  });
});
