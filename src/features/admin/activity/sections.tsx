import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Star } from 'lucide-react-native';
import { AdminText, Chip, PillButton, Row } from '@features/communityAdmin/components/primitives';
import { useAdminPalette, useScopedT } from '@features/communityAdmin/i18n';
import { SPACE, TYPE } from '@features/communityAdmin/theme';
import { HeldReviewNote } from '../disputes/HeldReviewNote';
import { PersonLine } from '../people/PersonLine';
import { personName } from '../people/personName';
import type {
  CommunityItem, DisputeItem, FeeItem, ModerationItem, Person, ProjectItem, ReviewItem,
} from './activityApi';

/** dd/mm/yyyy, or an em dash when there is no date. */
export function fmt(ms: number | null | undefined): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** A counterparty, by full name with a ⋮, and a label. Never the uid. */
function Who({ person, label }: { person: Person | null | undefined; label?: (name: string) => string }) {
  const { t } = useScopedT('admin_people');
  if (!person) return null;
  const name = personName(person.name, t('unknown_user'), person.uid);
  return <PersonLine uid={person.uid} name={name} text={label ? label(name) : name} />;
}

/** Shared row chrome: a wrapping row whose text block grows and whose chips drop under it on a phone. */
function Item({ testID, children }: { testID: string; children: React.ReactNode }) {
  const { rowDir } = useScopedT('admin_activity');
  return <Row rowDir={rowDir} wrap testID={testID}>{children}</Row>;
}

function Body({ children }: { children: React.ReactNode }) {
  return <View style={styles.body}>{children}</View>;
}

function Title({ children }: { children: React.ReactNode }) {
  const { textAlign } = useScopedT('admin_activity');
  return <AdminText weight="semiBold" numberOfLines={3} style={[TYPE.rowName, { textAlign }]}>{children}</AdminText>;
}

function Meta({ children, selectable, tone, testID }: { children: React.ReactNode; selectable?: boolean; tone?: 'bad' | 'text2'; testID?: string }) {
  const p = useAdminPalette();
  const { textAlign } = useScopedT('admin_activity');
  return (
    <AdminText selectable={selectable} testID={testID} style={[TYPE.rowMeta, { color: tone === 'bad' ? p.bad : tone === 'text2' ? p.text2 : p.text3, textAlign }]}>
      {children}
    </AdminText>
  );
}

function Chips({ children }: { children: React.ReactNode }) {
  const { rowDir } = useScopedT('admin_activity');
  return <View style={[styles.chips, { flexDirection: rowDir }]}>{children}</View>;
}

export function ModerationRow({ item }: { item: ModerationItem }) {
  const { t } = useScopedT('admin_activity');
  if (item.kind === 'action') {
    return (
      <Item testID={`activity-moderation-${item.id}`}>
        <Body>
          <Title>{`${t(`action_${item.action}`)} · ${fmt(item.at)}`}</Title>
          {!!item.reason && <Meta tone="text2" selectable>{item.reason}</Meta>}
          <Meta>{t('by', { name: item.actorName || '—' })}</Meta>
        </Body>
      </Item>
    );
  }
  return (
    <Item testID={`activity-moderation-${item.id}`}>
      <Body>
        <Title>{`${t(item.kind)} · ${fmt(item.at)}`}</Title>
        {!!item.reason && <Meta tone="text2" selectable>{item.reason}</Meta>}
        {!!item.snippet && <Meta selectable>{item.snippet}</Meta>}
        <Who person={item.other} label={(name) => t(item.kind === 'report_received' ? 'report_by' : 'report_about', { name })} />
        <Chips><Chip label={t(`status_${item.status}`)} /></Chips>
      </Body>
    </Item>
  );
}

export function ProjectRow({ item }: { item: ProjectItem }) {
  const { t } = useScopedT('admin_activity');
  const { t: tp } = useScopedT('admin_people');
  const { t: tProj } = useScopedT('admin_projects');
  const router = useRouter();
  return (
    <Item testID={`activity-projects-${item.projectId}`}>
      <Body>
        <Title>{item.title || tp('untitled_project')}</Title>
        <Meta>{[tProj(`status_${item.status}`), fmt(item.at), item.completedAt ? t('completed_on', { date: fmt(item.completedAt) }) : null].filter(Boolean).join(' · ')}</Meta>
        {item.engagement ? <Meta tone="text2">{t('engagement_line', { status: item.engagement.status ?? '—', amount: item.engagement.amount.toLocaleString() })}</Meta> : null}
        {item.others.map((o) => <Who key={o.uid} person={o} />)}
        <Chips>{item.roles.map((r) => <Chip key={r} label={t(`role_${r}`)} tone="accent" />)}</Chips>
        {item.chatId ? (
          <PillButton
            label={t('chat_open')}
            onPress={() => router.push(`/admin/project-chat?chatId=${item.chatId}&projectId=${item.projectId}` as never)}
            testID={`activity-chat-${item.projectId}`}
          />
        ) : null}
      </Body>
    </Item>
  );
}

export function FeeRow({ item }: { item: FeeItem }) {
  const { t } = useScopedT('admin_activity');
  const { t: tFees } = useScopedT('admin_fees');
  const { t: tp } = useScopedT('admin_people');
  return (
    <Item testID={`activity-fees-${item.projectId}`}>
      <Body>
        <Title>{item.title || tp('untitled_project')}</Title>
        <Meta tone="text2">{t('fee_amounts', { base: item.baseAmount.toLocaleString(), due: item.feeDue.toLocaleString(), paid: item.paidAmount.toLocaleString() })}</Meta>
        {item.feePaid ? <Meta>{`${t('fee_paid_by', { how: t(`paid_by_${item.paidBy ?? 'admin'}`) })} · ${fmt(item.paidAt)}`}</Meta> : null}
        {item.paymentLink ? (
          <Meta>{`${t('link_line', { amount: item.paymentLink.amount.toLocaleString() })}${item.paymentLink.superseded ? ` · ${t('link_superseded')}` : ''} · ${fmt(item.paymentLink.createdAt)}`}</Meta>
        ) : null}
        {item.paymentLink ? <Meta selectable>{t('process_line', { id: item.paymentLink.processId })}</Meta> : null}
        {item.providerRef ? <Meta selectable>{t('ref_line', { ref: item.providerRef })}</Meta> : null}
        {item.review ? <Meta tone="bad">{tFees(`charge_reason_${item.review}`)}</Meta> : null}
        <Chips>
          <Chip label={item.feePaid ? t('fee_settled') : t('fee_unpaid')} tone={item.feePaid ? 'neutral' : 'accent'} />
          {item.engagementStatus ? <Chip label={item.engagementStatus} /> : null}
        </Chips>
      </Body>
    </Item>
  );
}

export function DisputeRow({ item }: { item: DisputeItem }) {
  const { t } = useScopedT('admin_activity');
  const { t: tFees } = useScopedT('admin_fees');
  const { t: tp } = useScopedT('admin_people');
  return (
    <Item testID={`activity-disputes-${item.projectId}-${item.pro.uid}`}>
      <Body>
        <Title>{item.title || tp('untitled_project')}</Title>
        <Meta>{`${t(item.role === 'professional' ? 'role_dispute_pro' : 'role_dispute_client')} · ${fmt(item.at)}`}</Meta>
        <Who person={item.pro} label={(name) => tFees('pro_label', { name })} />
        {item.reason ? <Meta tone="bad">{tFees(`reason_${item.reason}`)}</Meta> : null}
        {item.note ? <Meta tone="text2" selectable>{item.note}</Meta> : null}
        {item.originalFee !== null ? <Meta>{t('original_fee', { n: item.originalFee.toLocaleString() })}</Meta> : null}
        {item.outcome ? <Meta>{`${t(`outcome_${item.outcome}`)} · ${fmt(item.resolvedAt)}`}</Meta> : null}
        <HeldReviewNote review={item.heldReview} testID={`activity-held-${item.projectId}-${item.pro.uid}`} />
        <Chips><Chip label={t(`state_${item.state}`)} tone={item.state === 'open' ? 'accent' : 'neutral'} /></Chips>
      </Body>
    </Item>
  );
}

export function ReviewRow({ item }: { item: ReviewItem }) {
  const p = useAdminPalette();
  const { t } = useScopedT('admin_activity');
  const { rowDir } = useScopedT('admin_activity');
  return (
    <Item testID={`activity-reviews-${item.id}`}>
      <Body>
        <View style={[styles.ratingLine, { flexDirection: rowDir }]}>
          <Star size={15} color={p.warn} fill={p.warn} strokeWidth={2} />
          <AdminText weight="semiBold" tabular style={TYPE.rowName}>{t('rating', { n: item.rating })}</AdminText>
          <Meta>{`· ${fmt(item.at)}`}</Meta>
        </View>
        {item.text ? <Meta tone="text2" selectable>{item.text}</Meta> : null}
        <Who person={item.other} label={(name) => t(item.direction === 'received' ? 'review_from' : 'review_of', { name })} />
        <Chips>
          <Chip label={t(`direction_${item.direction}`)} tone="accent" />
          {item.held ? <Chip label={t('held')} /> : !item.published ? <Chip label={t('unpublished')} /> : null}
        </Chips>
      </Body>
    </Item>
  );
}

export function CommunityRow({ item }: { item: CommunityItem }) {
  const { t } = useScopedT('admin_activity');
  return (
    <Item testID={`activity-communities-${item.id}`}>
      <Body>
        <Title>{item.name}</Title>
        <Meta>{`${t('members_count', { n: item.memberCount })} · ${fmt(item.at)}`}</Meta>
        <Chips>
          <Chip label={t(`role_${item.role}`)} tone="accent" />
          <Chip label={t(`status_${item.status}`)} />
        </Chips>
      </Body>
    </Item>
  );
}

const styles = StyleSheet.create({
  body: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0, gap: 3 },
  chips: { gap: 6, flexWrap: 'wrap', marginTop: 2 },
  ratingLine: { alignItems: 'center', gap: 6 },
});
export const ROW_PAD = SPACE.rowPadH;
