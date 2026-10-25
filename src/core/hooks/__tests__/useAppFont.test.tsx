import { renderHook } from '@testing-library/react-native';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAppFont } from '../useAppFont';

const use = (language: 'en' | 'he') => {
  useSettingsStore.setState({ language });
  return renderHook(() => useAppFont()).result.current;
};

describe('useAppFont', () => {
  it('English is Montserrat, one static family per weight, no fontWeight', () => {
    const f = use('en');
    expect(f.regular).toEqual({ fontFamily: 'Montserrat-Regular' });
    expect(f.light).toEqual({ fontFamily: 'Montserrat-Light' });
    expect(f.medium).toEqual({ fontFamily: 'Montserrat-Medium' });
    expect(f.semiBold).toEqual({ fontFamily: 'Montserrat-SemiBold' });
    expect(f.bold).toEqual({ fontFamily: 'Montserrat-Bold' });
  });

  it('Hebrew is Heebo, one static family per weight, no fontWeight', () => {
    const f = use('he');
    expect(f.regular).toEqual({ fontFamily: 'Heebo-Regular' });
    expect(f.light).toEqual({ fontFamily: 'Heebo-Light' });
    expect(f.medium).toEqual({ fontFamily: 'Heebo-Medium' });
    expect(f.semiBold).toEqual({ fontFamily: 'Heebo-SemiBold' });
    expect(f.bold).toEqual({ fontFamily: 'Heebo-Bold' });
  });

  it('forText picks the face per string, whatever the UI language', () => {
    const f = use('en');
    expect(f.forText('שלום', 'bold')).toEqual({ fontFamily: 'Heebo-Bold' });
    expect(f.forText('Hello', 'semiBold')).toEqual({ fontFamily: 'Montserrat-SemiBold' });
    expect(f.forText('', 'regular')).toEqual({ fontFamily: 'Montserrat-Regular' });
  });
});
