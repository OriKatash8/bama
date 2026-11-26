import { forwardRef } from 'react';
import { Platform, ScrollView, type ScrollViewProps } from 'react-native';
import { toListOffset, toScrollTop } from '../utils/chatListScroll';

/**
 * The chat list's scroller on WEB. Native uses FlatList's `inverted`; on web that is a CSS
 * `scaleY(-1)` on the scroller, which reverses the scrollbar drag and the keyboard (PageUp, End…),
 * so this does it with layout instead:
 *
 *   - the scroller is `flex-direction: column-reverse`: the browser anchors it at the bottom, and
 *     wheel, trackpad, scrollbar and keyboard are all native and the right way round;
 *   - the content container is `column-reverse` too, so NEWEST-FIRST data draws newest at the bottom;
 *   - offsets are reported as the distance from the newest message (-scrollTop), and `scrollTo`
 *     takes the same, so the list's own windowing and the screen's near-bottom check see exactly
 *     what they see on native.
 *
 * Needs EVERY row rendered (chatListPlatformProps): with a windowed list the rows mounting and
 * unmounting change the content height under a bottom-anchored scroller, and it drifts.
 */
export const ColumnReverseScrollView = forwardRef<ScrollView, ScrollViewProps>(function ColumnReverseScrollView(props, ref) {
  const { onScroll, style, contentContainerStyle } = props;
  return (
    <ScrollView
      {...props}
      ref={(r) => {
        if (r) patchScrollTo(r);
        if (typeof ref === 'function') ref(r);
        else if (ref) (ref as { current: ScrollView | null }).current = r;
      }}
      style={[style, { flexDirection: 'column-reverse' }]}
      contentContainerStyle={[contentContainerStyle, { flexDirection: 'column-reverse' }]}
      onScroll={onScroll && ((e) => {
        const n = e.nativeEvent;
        onScroll({ ...e, nativeEvent: { ...n, contentOffset: { ...n.contentOffset, y: toListOffset(n.contentOffset.y) } } });
      })}
    />
  );
});

type Patched = ScrollView & { __columnReverse?: boolean };

/** scrollTo({ y }) takes the list's offset (distance from newest); the browser wants scrollTop. */
function patchScrollTo(r: ScrollView): void {
  const p = r as Patched;
  if (p.__columnReverse) return;
  p.__columnReverse = true;
  const original = p.scrollTo.bind(p);
  p.scrollTo = ((o?: { x?: number; y?: number; animated?: boolean }) => original({ ...o, y: toScrollTop(o?.y ?? 0) })) as ScrollView['scrollTo'];
}

/**
 * Props that make the chat FlatList right on each platform. Native: `inverted`. Web: the scroller
 * above, with every row rendered (the app already loads a chat's whole history; paginated loading
 * is the follow-up that lets web window again).
 */
export function chatListPlatformProps(itemCount: number) {
  if (Platform.OS !== 'web') return { inverted: true } as const;
  const all = Math.max(itemCount, 1);
  return {
    renderScrollComponent: (p: ScrollViewProps) => <ColumnReverseScrollView {...p} />,
    initialNumToRender: all,
    maxToRenderPerBatch: 100000,
    windowSize: 100000,
  } as const;
}
