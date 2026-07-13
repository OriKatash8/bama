import { useSettingsStore } from '../stores/settingsStore';

export function useAppFont() {
  const language = useSettingsStore((s) => s.language);
  const isHe = language === 'he';
  return {
    regular:  isHe ? 'Heebo-Regular'  : 'Montserrat-Regular',
    medium:   isHe ? 'Heebo-Medium'   : 'Montserrat-Medium',
    semiBold: isHe ? 'Heebo-SemiBold' : 'Montserrat-SemiBold',
    bold:     isHe ? 'Heebo-Bold'     : 'Montserrat-Bold',
    light:    isHe ? 'Heebo-Light'    : 'Montserrat-Light',
  };
}
