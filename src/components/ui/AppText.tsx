import { Text, type TextProps } from 'react-native';
import { useAppFont } from '@core/hooks/useAppFont';
import type { ReactNode } from 'react';

export type AppTextWeight = 'regular' | 'medium' | 'semiBold' | 'bold' | 'light';

type AppTextProps = TextProps & { weight?: AppTextWeight };

function extractString(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(extractString).join('');
  return '';
}

export function AppText({ weight = 'regular', style, children, ...rest }: AppTextProps) {
  const font = useAppFont();
  const fontStyle = font.forText(extractString(children), weight);
  return <Text style={[style, fontStyle]} {...rest}>{children}</Text>;
}
