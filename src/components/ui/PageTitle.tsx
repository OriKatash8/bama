import { Text, StyleSheet, type TextProps } from 'react-native';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';

type Props = {
  children: React.ReactNode;
} & Pick<TextProps, 'numberOfLines' | 'style'>;

/**
 * Standard main/page title for tab pages — identical size, weight, colour, and
 * top position everywhere, right-aligned in Hebrew / left in English. Use this
 * for a page's first/main heading so the style can't drift per-screen.
 */
export function PageTitle({ children, style, ...rest }: Props) {
  const rtl = useSettingsStore((s) => s.language) === 'he';
  const font = useAppFont();
  return (
    <Text
      {...rest}
      style={[styles.title, font.bold, { textAlign: rtl ? 'right' : 'left' }, style]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#004aad',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
});
