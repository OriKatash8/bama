import { Platform } from 'react-native';
import { chatListPlatformProps } from '../ColumnReverseScrollView';

describe('chatListPlatformProps', () => {
  const original = Platform.OS;
  afterEach(() => { Object.defineProperty(Platform, 'OS', { value: original, configurable: true }); });

  it('is the inverted FlatList on native, and nothing else', () => {
    for (const os of ['ios', 'android']) {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
      expect(chatListPlatformProps(500)).toEqual({ inverted: true });
    }
  });

  it('on web: NOT inverted (that is scaleY(-1), which reverses the scrollbar and keyboard), the column-reverse scroller instead, with every row rendered', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    const p = chatListPlatformProps(500) as Record<string, unknown>;
    expect(p.inverted).toBeUndefined();
    expect(typeof p.renderScrollComponent).toBe('function');
    expect(p.initialNumToRender).toBe(500);
    expect(p.maxToRenderPerBatch).toBeGreaterThanOrEqual(100000);
    expect(p.windowSize).toBeGreaterThanOrEqual(100000);
  });

  it('web renders at least one row for an empty chat, so the first message is not delayed a batch', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    expect((chatListPlatformProps(0) as { initialNumToRender: number }).initialNumToRender).toBe(1);
  });
});
