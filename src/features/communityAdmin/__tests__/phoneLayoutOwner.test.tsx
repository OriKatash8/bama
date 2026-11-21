import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { MembersCard, type MemberRowData } from '../components/MembersCard';
import { RequestsCard } from '../components/RequestsCard';

/**
 * The community-owner screen (user-facing, not admin) at PHONE width, in Hebrew: the member row drops
 * its 72px activity bar and wraps its chips and buttons; a join request's buttons drop under the text.
 */
let mockW = 375;
let mockLang = 'en';
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockW, height: 667, scale: 2, fontScale: 1 }),
}));
jest.mock('react-native-reanimated', () => require('../../../testing/reanimatedMock').reanimatedMock());
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));

beforeEach(() => { mockW = 375; mockLang = 'en'; });

describe('the community-owner screen at 375px, in Hebrew', () => {
  const member = (over: Partial<MemberRowData> = {}): MemberRowData => ({
    userId: 'u1', name: 'דנה כהן-לוי', meta: 'חברה · הצטרפה לפני שבועיים', searchText: '', isOwner: false,
    messages: 42, activity: 0.5, aboveMedian: true, ...over,
  });
  const members = () => render(
    <MembersCard
      rows={[{ item: member(), leaving: false }]} memberCount={1} query="" onQuery={() => {}}
      onRemove={() => {}} onMakeHost={() => {}} onGone={() => {}}
    />,
  );

  it('MembersCard: the row wraps, the 72px activity bar is left out, the name and the buttons stay', () => {
    mockLang = 'he';
    const r = members();
    expect(StyleSheet.flatten(r.getByTestId('member-u1').props.style).flexWrap).toBe('wrap');
    expect(StyleSheet.flatten(r.getByTestId('member-u1').props.style).flexDirection).toBe('row-reverse');
    expect(r.queryByTestId('activity-bar')).toBeNull();
    expect(r.getByText('דנה כהן-לוי')).toBeTruthy();
    expect(r.getByTestId('remove-u1')).toBeTruthy();
    expect(r.getByTestId('make-host-u1')).toBeTruthy();
  });

  it('MembersCard: on a wide window the activity bar is still there', () => {
    mockW = 1024;
    expect(members().getByTestId('activity-bar')).toBeTruthy();
  });

  it('RequestsCard: the row wraps so Approve / Reject drop under the text', () => {
    mockLang = 'he';
    const r = render(
      <RequestsCard
        rows={[{ item: { userId: 'r1', name: 'יוסי', meta: 'מבקש להצטרף', proProfile: 'unknown' }, leaving: false }]}
        pendingCount={1} twoColumns={false} onApprove={() => {}} onReject={() => {}} onApproveAll={() => {}} onGone={() => {}}
      />,
    );
    expect(StyleSheet.flatten(r.getByTestId('request-r1').props.style).flexWrap).toBe('wrap');
    expect(r.getByTestId('approve-r1')).toBeTruthy();
    expect(r.getByTestId('reject-r1')).toBeTruthy();
  });
});
