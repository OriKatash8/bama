import { Text, type TextProps } from 'react-native';
import { useAppFont } from '@core/hooks/useAppFont';
import { extractText } from '@core/theme/extractText';

export type AppTextWeight = 'regular' | 'medium' | 'semiBold' | 'bold' | 'light';

type AppTextProps = TextProps & { weight?: AppTextWeight };

const NO_WEIGHT = { fontWeight: undefined } as const;

export function AppText({ weight = 'regular', style, children, ...rest }: AppTextProps) {
  const font = useAppFont();
  const fontStyle = font.forText(extractText(children), weight);
  // fontWeight: undefined cancels one the caller's style may carry: the weight is in
  // the static family, and on Android a second one would add synthetic bold.
  return <Text style={[style, fontStyle, NO_WEIGHT]} {...rest}>{children}</Text>;
}
