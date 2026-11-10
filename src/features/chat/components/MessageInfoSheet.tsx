import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@components/ui/AppText';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** What the message says (or "[photo]" etc.), shown as a quote at the top. */
  preview: string;
  /** Me. Never listed in either list, even if a caller passes it. */
  currentUserId: string;
  seenBy: string[];
  notSeen: string[];
  names: Record<string, string>;
  photos: Record<string, string | null | undefined>;
  /** Colour behind an initial when there is no photo. */
  colorFor: (uid: string) => string;
};

/**
 * "Message info" for one of MY messages: who has seen it and who has not, live (the
 * caller recomputes the lists from the read-state listener on every change). A
 * plain `Modal`, so it works on web as well as native.
 */
export function MessageInfoSheet({
  visible, onClose, preview, currentUserId, seenBy, notSeen, names, photos, colorFor,
}: Props) {
  const rtl = useSettingsStore((s) => s.language) === 'he';
  const tr = (rtl ? he : en).read_receipts;
  const row = rtl ? 'row-reverse' : 'row';
  const align = rtl ? 'right' : 'left';

  const seen = seenBy.filter((u) => u !== currentUserId);
  const waiting = notSeen.filter((u) => u !== currentUserId);

  const person = (uid: string) => {
    const name = names[uid] ?? '…';
    const photo = photos[uid];
    return (
      <View key={uid} testID={`info-person-${uid}`} style={[styles.person, { flexDirection: row }]}>
        <View style={[styles.avatar, { backgroundColor: photo ? '#eef0fa' : colorFor(uid) }]}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.avatarImg} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <AppText weight="bold" style={styles.initial}>{name.trim().charAt(0).toUpperCase()}</AppText>
          )}
        </View>
        <AppText style={[styles.name, { textAlign: align }]} numberOfLines={1}>{name}</AppText>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} testID="message-info-backdrop" />
        <View style={styles.card} testID="message-info">
          <AppText weight="semiBold" style={[styles.title, { textAlign: align }]}>{tr.message_info}</AppText>
          {!!preview && (
            <View style={styles.preview}>
              <AppText style={[styles.previewText, { textAlign: align }]} numberOfLines={3}>{preview}</AppText>
            </View>
          )}
          <ScrollView style={styles.lists} showsVerticalScrollIndicator={false}>
            <AppText weight="semiBold" style={[styles.heading, { textAlign: align }]}>{tr.seen_by}</AppText>
            {seen.length > 0
              ? seen.map(person)
              : <AppText testID="message-info-nobody" style={[styles.empty, { textAlign: align }]}>{tr.nobody_seen}</AppText>}
            {waiting.length > 0 && (
              <>
                <AppText weight="semiBold" style={[styles.heading, styles.headingGap, { textAlign: align }]}>{tr.not_seen}</AppText>
                {waiting.map(person)}
              </>
            )}
          </ScrollView>
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityRole="button" testID="message-info-close">
            <AppText weight="semiBold" style={styles.closeText}>{tr.close}</AppText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const AV = 36;
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, maxHeight: '80%', backgroundColor: '#ffffff', borderRadius: 20, paddingTop: 16, paddingHorizontal: 16 },
  title: { color: '#000000', fontSize: 17, marginBottom: 10 },
  preview: { backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  previewText: { color: '#000000', fontSize: 14 },
  lists: { flexGrow: 0 },
  heading: { color: '#004aad', fontSize: 13, marginBottom: 6, textTransform: 'none' },
  headingGap: { marginTop: 14 },
  empty: { color: 'rgba(0,0,0,0.5)', fontSize: 14, paddingVertical: 8 },
  person: { alignItems: 'center', gap: 10, paddingVertical: 6 },
  avatar: { width: AV, height: AV, borderRadius: AV / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: AV, height: AV },
  initial: { color: '#ffffff', fontSize: 15 },
  name: { flex: 1, color: '#000000', fontSize: 15 },
  close: { alignItems: 'center', paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.12)', marginTop: 10 },
  closeText: { color: '#004aad', fontSize: 16 },
});
