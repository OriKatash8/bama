import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text, View } from 'react-native';
import { renderRouter, act, screen } from 'expo-router/testing-library';
import { Stack, Tabs, usePathname, router } from 'expo-router';

/**
 * The chat room sits ABOVE the tab navigator, and leaving it goes back.
 *
 * Both halves of this file exist because of one reported bug: after swiping
 * back out of a chat, the app header and the tab bar took about a second to
 * appear.
 *
 * The cause was structural. The chat room used to be a screen INSIDE the tab
 * navigator at (tabs)/chats/[chatId], so the tabs layout had to erase its own
 * chrome while you were in one — `{!inChatRoom && <AppHeader/>}` and
 * `tabBarStyle: { display: 'none' }`, both derived from `usePathname()`. That
 * pathname only changes when the navigation state COMMITS, which on an
 * interactive edge-swipe is when your finger lifts. A device trace put the drag
 * at 493ms and everything after the commit at 168ms: for the whole drag the
 * chat list was being revealed underneath a layout still rendering as if you
 * were in a chat.
 *
 * Moving the flow above the tabs means nothing is hidden, so nothing has to
 * come back. The test that matters is the first one.
 */

const APP = join(__dirname, '..', '..', '..', '..', 'app');
const CLIENT_TABS = readFileSync(join(APP, '(client)', '(tabs)', '_layout.tsx'), 'utf8');
const PRO_TABS = readFileSync(join(APP, '(professional)', '(tabs)', '_layout.tsx'), 'utf8');
const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');

describe('the tab layouts no longer erase themselves for a chat', () => {
  it('neither layout derives anything from being in a chat room', () => {
    // The whole mechanism, gone. If this comes back, so does the delay.
    for (const layout of [CLIENT_TABS, PRO_TABS]) {
      expect(layout).not.toMatch(/inChatRoom/);
      expect(layout).not.toMatch(/\/chats\\\/\.\+/);
    }
  });

  it('renders the header unconditionally', () => {
    for (const layout of [CLIENT_TABS, PRO_TABS]) {
      expect(layout).toMatch(/^\s*<AppHeader \/>$/m);
      expect(layout).not.toMatch(/\{!\w+ && <AppHeader/);
    }
  });

  it('hides the tab bar only for the cases that are genuinely inside the tabs', () => {
    // The project-review wizard and the locked/editing professional are real
    // tab-navigator screens and still need it. A chat is not one any more.
    expect(CLIENT_TABS).toMatch(/const hideTabBar = pathname\.includes\('\/home\/summary'\);/);
    expect(PRO_TABS).toMatch(/tabBarStyle: \(locked \|\| profileEditing\)/);
  });

  it('keeps the chat route outside the tab navigator', () => {
    // The route file's location IS the fix; a move back would silently restore
    // the bug with every other assertion here still passing.
    expect(() => readFileSync(join(APP, '(client)', 'chat', '[chatId].tsx'))).not.toThrow();
    expect(() => readFileSync(join(APP, '(professional)', 'chat', '[chatId].tsx'))).not.toThrow();
    expect(() => readFileSync(join(APP, '(client)', '(tabs)', 'chats', '[chatId].tsx'))).toThrow();
  });
});

describe('the back arrow', () => {
  const BACK_ARROW = SRC.slice(SRC.indexOf('style={styles.headerBack}') - 500,
                               SRC.indexOf('style={styles.headerBack}') + 200);

  it('dismisses to the chat list rather than pushing a new one', () => {
    // Pushing mounted a second chat list on top of the room, so the stack grew
    // by two per visit and every room stayed alive underneath with its
    // listeners. Only the arrow is affected — the edge-swipe is a native pop.
    expect(BACK_ARROW).toMatch(/router\.dismissTo\(/);
    expect(BACK_ARROW).not.toMatch(/router\.push\(/);
  });

  it('still lands on the right tab for a community chat', () => {
    expect(BACK_ARROW).toMatch(/chatType === 'community' \? '\?tab=communities' : ''/);
  });

  it('still goes to the section the viewer is in', () => {
    expect(BACK_ARROW).toMatch(/activeMode === 'client' \? '\(client\)' : '\(professional\)'/);
  });
});

/**
 * Mount/unmount of the header, counted rather than queried.
 *
 * A text query cannot answer this: react-navigation hides the screens below the
 * top from the accessibility tree, so `queryByText` returns null for a header
 * that is alive and well underneath the chat room. What the fix is actually
 * about is whether the header has to be BUILT AGAIN on the way back — so count
 * the mounts.
 */
const headerLog: string[] = [];
function HeaderProbe() {
  React.useEffect(() => {
    headerLog.push('mount');
    return () => { headerLog.push('unmount'); };
  }, []);
  return <Text>APP-HEADER</Text>;
}

describe('with the chat room above the tabs, driven through a real router', () => {
  beforeEach(() => { headerLog.length = 0; });

  const routes = {
    _layout: () => <Stack screenOptions={{ headerShown: false }} />,
    '(client)/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
    '(client)/(tabs)/_layout': function TabsLayout() {
      // The real layout, as it now stands: chrome unconditional.
      const pathname = usePathname();
      const hideTabBar = pathname.includes('/home/summary');
      return (
        <View style={{ flex: 1 }}>
          <HeaderProbe />
          <Tabs screenOptions={{ headerShown: false, tabBarStyle: hideTabBar ? { display: 'none' } : undefined }} />
        </View>
      );
    },
    '(client)/(tabs)/chats/index': () => <Text>CHAT-LIST</Text>,
    '(client)/chat/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
    '(client)/chat/[chatId]': () => <Text>CHAT-ROOM</Text>,
  };

  const LIST = '/(client)/(tabs)/chats';
  const ROOM = '/(client)/chat/abc';

  it('NEVER unmounts the header for a chat — there is nothing to bring back', () => {
    // THE regression test. Under the old routing the tabs layout dropped
    // <AppHeader /> on the way in and rebuilt it on the way out, and the rebuild
    // could not start until the gesture committed. Here it is built once and
    // survives the whole round trip.
    const r = renderRouter(routes as never, { initialUrl: LIST });
    expect(headerLog).toEqual(['mount']);

    act(() => { router.push(ROOM); });
    expect(r.getPathname()).toBe('/chat/abc');
    expect(headerLog).toEqual(['mount']);          // still just the one

    act(() => { router.dismissTo(LIST); });
    expect(r.getPathname()).toBe('/chats');
    expect(headerLog).toEqual(['mount']);          // and no rebuild on the way back
  });

  it('would have caught the old arrangement', () => {
    // The anchor. A layout that drops the header for a chat logs a second
    // mount on the way back; the assertions above are only meaningful because
    // this shape is distinguishable from that one.
    const hiding = {
      ...routes,
      '(client)/(tabs)/_layout': function HidingTabsLayout() {
        const pathname = usePathname();
        const inChatRoom = /\/chat\/.+/.test(pathname);
        return (
          <View style={{ flex: 1 }}>
            {!inChatRoom && <HeaderProbe />}
            <Tabs screenOptions={{ headerShown: false }} />
          </View>
        );
      },
    };
    renderRouter(hiding as never, { initialUrl: LIST });
    act(() => { router.push(ROOM); });
    act(() => { router.dismissTo(LIST); });
    expect(headerLog).toEqual(['mount', 'unmount', 'mount']);
  });

  it('pops the room off rather than stacking, over repeated visits', () => {
    const r = renderRouter(routes as never, { initialUrl: LIST });
    for (const id of ['a', 'b', 'c', 'd']) {
      act(() => { router.push(`/(client)/chat/${id}`); });
      act(() => { router.dismissTo(LIST); });
    }
    expect(r.getPathname()).toBe('/chats');
    expect(headerLog).toEqual(['mount']);
  });

  it('still reaches the list from a chat opened cold, with nothing underneath', () => {
    // A notification deep-links straight into the room.
    const r = renderRouter(routes as never, { initialUrl: ROOM });
    expect(screen.queryByText('CHAT-ROOM')).not.toBeNull();

    act(() => { router.dismissTo(LIST); });
    expect(r.getPathname()).toBe('/chats');
    // Opened cold, so the header is built once here — and not again.
    expect(headerLog).toEqual(['mount']);
  });

  it('carries the communities tab param through', () => {
    const r = renderRouter(routes as never, { initialUrl: LIST });
    act(() => { router.push(ROOM); });
    act(() => { router.dismissTo(`${LIST}?tab=communities`); });
    expect(r.getPathname()).toBe('/chats');
    expect(r.getSearchParams()).toMatchObject({ tab: 'communities' });
  });
});
