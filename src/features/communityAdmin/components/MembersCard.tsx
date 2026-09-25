import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { Search } from 'lucide-react-native';
import { useAdminPalette, useAdminT } from '../i18n';
import { EASE_OUT, HEEBO, MOTION, RADIUS, SPACE, TYPE } from '../theme';
import { AdminText, Card, Chip, EmptyState, InitialsAvatar, PillButton, Row, WhoBlock } from './primitives';
import { CollapseOut } from './CollapseOut';

export type MemberRowData = {
  userId: string;
  name: string;
  meta: string;
  /** Extra text the search matches on (role labels in both languages). */
  searchText: string;
  isOwner: boolean;
  messages: number;
  /** 0..1 of the most active member's count. */
  activity: number;
  /** Above the community median: the bar is accent, else text3. */
  aboveMedian: boolean;
};

export function MembersCard({
  rows,
  memberCount,
  query,
  onQuery,
  onRemove,
  onGone,
}: {
  rows: { item: MemberRowData; leaving: boolean }[];
  memberCount: number;
  query: string;
  onQuery: (q: string) => void;
  onRemove: (m: MemberRowData) => void;
  onGone: (userId: string) => void;
}) {
  const p = useAdminPalette();
  const { t, rowDir, textAlign } = useAdminT();

  return (
    <Card testID="members-card">
      <View style={[styles.head, { flexDirection: rowDir }]}>
        <AdminText weight="semiBold" accessibilityRole="header" style={TYPE.cardTitle}>
          {t('members_title')}
        </AdminText>
        <AdminText tabular style={[TYPE.rowMeta, { color: p.text3 }]} testID="members-count">
          {t('members_count', { n: memberCount })}
        </AdminText>
        <View style={styles.spacer} />
        <View style={[styles.search, { flexDirection: rowDir, backgroundColor: p.surface2, borderColor: p.border }]}>
          <Search size={13} color={p.text3} strokeWidth={2.4} />
          <TextInput
            value={query}
            onChangeText={onQuery}
            placeholder={t('search')}
            placeholderTextColor={p.text3}
            accessibilityLabel={t('search_a11y')}
            testID="member-search"
            style={[styles.searchInput, webNoOutline, { color: p.text, fontFamily: HEEBO.regular, textAlign }]}
          />
        </View>
      </View>
      <AdminText style={[styles.note, { color: p.text3, textAlign }]}>{t('members_note')}</AdminText>
      <View style={styles.list}>
        {rows.length === 0 ? (
          <EmptyState text={t('empty_members')} testID="members-empty" />
        ) : (
          rows.map(({ item, leaving }) => (
            <CollapseOut key={item.userId} leaving={leaving} onGone={() => onGone(item.userId)}>
              <MemberRow member={item} leaving={leaving} onRemove={() => onRemove(item)} />
            </CollapseOut>
          ))
        )}
      </View>
    </Card>
  );
}

/**
 * Avatar, name + "role · joined X ago", owner chip, activity bar, message
 * count, Remove. Remove is a two-tap inline confirm — Alert.alert silently
 * does nothing on web — and the armed state resets itself after 4s.
 */
function MemberRow({ member, leaving, onRemove }: { member: MemberRowData; leaving: boolean; onRemove: () => void }) {
  const { t, rowDir, textAlign } = useAdminT();
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function disarm() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setArmed(false);
  }

  function pressRemove() {
    if (armed) {
      disarm();
      onRemove();
      return;
    }
    setArmed(true);
    timer.current = setTimeout(disarm, MOTION.confirmWindow);
  }

  return (
    <Row rowDir={rowDir} testID={`member-${member.userId}`}>
      <InitialsAvatar name={member.name} />
      <WhoBlock name={member.name} meta={member.meta} textAlign={textAlign} />
      {member.isOwner && <Chip label={t('owner_chip')} tone="accent" />}
      <ActivityBar fraction={member.activity} hot={member.aboveMedian} label={t('messages_a11y', { n: member.messages })} />
      <Chip label={member.messages.toLocaleString('en-US')} tabular />
      {!member.isOwner && (
        <View style={[styles.actions, { flexDirection: rowDir }]}>
          <PillButton
            variant="danger"
            label={armed ? t('confirm_remove') : t('remove')}
            onPress={pressRemove}
            disabled={leaving}
            testID={`remove-${member.userId}`}
          />
          {armed && <PillButton label={t('cancel')} onPress={disarm} testID={`cancel-remove-${member.userId}`} />}
        </View>
      )}
    </Row>
  );
}

/** 72×6 track; the fill grows to its width over 1s (end state under reduced motion). */
function ActivityBar({ fraction, hot, label }: { fraction: number; hot: boolean; label: string }) {
  const p = useAdminPalette();
  const reduce = useReducedMotion();
  // A sliver even at 0, so an idle member still reads as "a bar", not a gap.
  const target = Math.max(0.06, Math.min(1, fraction));
  const width = useSharedValue(reduce ? target : 0);
  useEffect(() => {
    width.value = reduce ? target : withTiming(target, { duration: MOTION.activityFill, easing: Easing.bezier(...EASE_OUT) });
  }, [target, reduce, width]);
  const fill = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
  return (
    <View style={[styles.track, { backgroundColor: p.surface3 }]} accessibilityLabel={label} testID="activity-bar">
      <Animated.View style={[styles.fill, { backgroundColor: hot ? p.accent : p.text3 }, fill]} />
    </View>
  );
}

/** The pill is the focus affordance; the browser's input outline would sit inside it. */
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 10, paddingTop: 16, paddingHorizontal: SPACE.rowPadH, flexWrap: 'wrap' },
  spacer: { flex: 1 },
  search: {
    alignItems: 'center',
    gap: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  searchInput: { width: 120, fontSize: 12.5, padding: 0 },
  note: { fontSize: 12, paddingTop: 12, paddingHorizontal: SPACE.rowPadH },
  list: { marginTop: 10 },
  actions: { gap: 7, flexShrink: 0 },
  track: { width: 72, height: 6, borderRadius: RADIUS.pill, overflow: 'hidden', flexShrink: 0 },
  fill: { height: '100%', borderRadius: RADIUS.pill },
});
