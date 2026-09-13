import { useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { VideoPlayer } from '@components/ui/VideoPlayer';
import { PortfolioViewer } from '@features/profile/components/PortfolioViewer';
import { useSettingsStore } from '@core/stores/settingsStore';
import type { MediaAsset } from '@core/types/media';
import { useChatMedia } from '../hooks/useChatMedia';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    let result: unknown = translations;
    for (const k of key.split('.')) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

const STRIP_COUNT = 4;
const GRID_COLUMNS = 3;
const GRID_GAP = 2;

function Thumb({ asset, size, testID }: { asset: MediaAsset; size: number; testID: string }) {
  return (
    <View style={{ width: size, height: size }}>
      {asset.type === 'video' ? (
        <VideoPlayer uri={asset.url} style={{ width: size, height: size }} thumbnailOnly />
      ) : (
        <Image source={{ uri: asset.url }} style={{ width: size, height: size }} contentFit="cover" cachePolicy="memory-disk" />
      )}
      {asset.type === 'video' && (
        <View style={styles.playBadge} pointerEvents="none" testID={`${testID}-play`}>
          <Play size={14} color="#ffffff" fill="#ffffff" strokeWidth={2} />
        </View>
      )}
    </View>
  );
}

/**
 * WhatsApp-style media for a project's chat: a card with the count and the latest
 * four thumbnails. It opens a pop-up grid of every photo and video; any item opens
 * the full-screen viewer there, with swipe, pinch-zoom and video playback.
 * Renders nothing when there's no chat or no media.
 */
export function ChatMediaSection({ chatId }: { chatId: string | undefined }) {
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const media = useChatMedia(chatId);
  const { width } = useWindowDimensions();

  const [gridOpen, setGridOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const cellSize = useMemo(() => Math.floor((width - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS), [width]);

  if (!chatId || media.length === 0) return null;

  const rowDir = rtl ? 'row-reverse' : 'row';
  const Chevron = rtl ? ChevronLeft : ChevronRight;

  return (
    <>
      <View style={styles.card}>
        <TouchableOpacity
          testID="media-header"
          style={[styles.header, { flexDirection: rowDir }]}
          onPress={() => setGridOpen(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${t('project_details.media')} ${media.length}`}
        >
          <AppText weight="semiBold" style={[styles.title, { textAlign: rtl ? 'right' : 'left' }]}>
            {t('project_details.media')}
          </AppText>
          <AppText weight="regular" style={styles.count}>{String(media.length)}</AppText>
          <Chevron size={18} color="rgba(15,15,31,0.4)" strokeWidth={2} />
        </TouchableOpacity>

        <View style={[styles.strip, { flexDirection: rowDir }]}>
          {media.slice(0, STRIP_COUNT).map((asset, i) => (
            <TouchableOpacity
              key={asset.id}
              testID={`media-strip-${asset.id}`}
              style={styles.stripItem}
              onPress={() => setViewerIndex(i)}
              activeOpacity={0.85}
            >
              <Thumb asset={asset} size={72} testID={`media-strip-${asset.id}`} />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Modal visible={gridOpen} animationType="slide" onRequestClose={() => setGridOpen(false)}>
        <View style={styles.gridScreen} testID="media-grid">
          <View style={[styles.gridHeader, { flexDirection: rowDir }]}>
            <AppText weight="bold" style={styles.gridTitle}>
              {`${t('project_details.media')} · ${media.length}`}
            </AppText>
            <TouchableOpacity
              onPress={() => setGridOpen(false)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('project_details.media_close')}
            >
              <X size={24} color="#004aad" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={media}
            keyExtractor={(a) => a.id}
            numColumns={GRID_COLUMNS}
            columnWrapperStyle={{ gap: GRID_GAP, flexDirection: rowDir }}
            contentContainerStyle={{ gap: GRID_GAP, paddingBottom: 24 }}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                testID={`media-grid-item-${item.id}`}
                onPress={() => setViewerIndex(index)}
                activeOpacity={0.85}
              >
                <Thumb asset={item} size={cellSize} testID={`media-grid-item-${item.id}`} />
              </TouchableOpacity>
            )}
          />
        </View>
        {/* Inside the grid's Modal while it's open, so iOS can present the viewer
            over it (a sibling Modal can't be presented over another). */}
        {gridOpen && (
          <PortfolioViewer
            assets={media}
            initialIndex={viewerIndex ?? 0}
            visible={viewerIndex !== null}
            onClose={() => setViewerIndex(null)}
          />
        )}
      </Modal>

      {!gridOpen && (
        <PortfolioViewer
          assets={media}
          initialIndex={viewerIndex ?? 0}
          visible={viewerIndex !== null}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  );
}

const CARD_SHADOW = {
  shadowColor: '#1e4fa3' as const,
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(30,79,163,0.07)',
    ...CARD_SHADOW,
  },
  header: { alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 15, color: '#004aad' },
  count: { fontSize: 14, color: 'rgba(15,15,31,0.4)' },
  strip: { gap: 8 },
  stripItem: { borderRadius: 10, overflow: 'hidden' },
  playBadge: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)',
  },
  gridScreen: { flex: 1, backgroundColor: '#ffffff', paddingTop: 52 },
  gridHeader: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  gridTitle: { fontSize: 18, color: '#004aad' },
});
