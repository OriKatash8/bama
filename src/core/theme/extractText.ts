import { isValidElement, type ReactNode } from 'react';

/**
 * The plain text inside `children`, for choosing a script (Hebrew vs Latin).
 * Strings, numbers, arrays and the children of nested elements are read;
 * anything else contributes nothing. Looking into nested elements means
 * `<Text><Text>שלום</Text></Text>` is recognised as Hebrew from the outside.
 */
export function extractText(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (isValidElement(children)) return extractText((children.props as { children?: ReactNode }).children);
  return '';
}
