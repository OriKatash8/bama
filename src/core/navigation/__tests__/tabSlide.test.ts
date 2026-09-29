import { Animated } from 'react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TAB_SLIDE } from '../tabSlide';

/**
 * Switching tabs slides the whole screen across, like a stack push/pop — the
 * slide the chat and project details already have. The next tab comes in from
 * the right, the previous one from the left (the tab order is not mirrored).
 */

jest.mock('react-native/Libraries/Utilities/Dimensions', () => ({
  __esModule: true,
  default: {
    get: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }),
    addEventListener: () => ({ remove: () => {} }),
  },
}));

function translateAt(progress: number): number {
  const style = TAB_SLIDE.sceneStyleInterpolator({ current: { progress: new Animated.Value(progress) } } as never);
  const t = (style.sceneStyle as { transform: { translateX: Animated.AnimatedInterpolation<number> }[] }).transform[0].translateX;
  return (t as unknown as { __getValue: () => number }).__getValue();
}

it('slides a full screen width: next on the right, previous on the left', () => {
  expect(translateAt(0)).toBe(0);
  expect(translateAt(1)).toBe(400);
  expect(translateAt(-1)).toBe(-400);
});

it('animates with a spring, like the stack', () => {
  expect(TAB_SLIDE.transitionSpec.animation).toBe('spring');
});

it('both tab bars use it', () => {
  for (const group of ['(client)', '(professional)']) {
    const src = readFileSync(join(__dirname, '..', '..', '..', 'app', group, '(tabs)', '_layout.tsx'), 'utf8');
    expect(src).toMatch(/\.\.\.TAB_SLIDE/);
  }
});
