import { act, render } from '@testing-library/react-native';
import { FittedPhoto } from '../FittedPhoto';

const load = (r: ReturnType<typeof render>, width: number, height: number) =>
  act(() => { r.getByTestId('p').props.onLoad({ nativeEvent: { source: { width, height } } }); });

it('is fitted before its size is known', () => {
  const r = render(<FittedPhoto uri="https://x/p.jpg" testID="p" />);
  expect(r.getByTestId('p').props.contentFit).toBe('contain');
});

it('a horizontal photo fills the box', () => {
  const r = render(<FittedPhoto uri="https://x/p.jpg" testID="p" />);
  load(r, 1600, 1000);
  expect(r.getByTestId('p').props.contentFit).toBe('cover');
});

it('a vertical or square photo stays whole (fitted)', () => {
  const v = render(<FittedPhoto uri="https://x/p.jpg" testID="p" />);
  load(v, 1000, 1600);
  expect(v.getByTestId('p').props.contentFit).toBe('contain');
  const s = render(<FittedPhoto uri="https://x/p.jpg" testID="p" />);
  load(s, 1000, 1000);
  expect(s.getByTestId('p').props.contentFit).toBe('contain');
});
