import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Check, RotateCw, X } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import {
  ASPECTS, MIN_CROP, coversWholeImage, fitContain, initialCrop, moveRect, resizeCorner, rotatedSize, toPixelCrop,
  type AspectKey, type Corner, type Rect, type Size,
} from '@core/media/crop/cropMath';
import { applyCrop, normalizeForEditing, type EditableImage } from '@core/media/crop/cropImage';

type Props = {
  /** The photo to edit (the original file; orientation is handled here). */
  uri: string;
  onCancel: () => void;
  /** Called with the edited JPEG. Not called when nothing was changed (that is a cancel). */
  onDone: (result: EditableImage) => void;
  accent: string;
  rtl: boolean;
  t: (key: string) => string;
  topInset: number;
  bottomInset: number;
};

const HANDLE = 44; // touch target
const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];
const PRESETS: AspectKey[] = ['free', '1:1', '4:5', '16:9'];

/**
 * WhatsApp-style crop: a draggable frame with corner handles over the photo, aspect presets,
 * rotate 90°, Reset, Done. The frame lives in display points; `cropMath` turns it into real
 * pixels for expo-image-manipulator. Everything is physical left/right (the picture is not
 * mirrored in Hebrew); only the button rows follow `rtl`.
 *
 * Rendered inside the chat preview Modal (not a second Modal), under a GestureHandlerRootView
 * because Android needs its own root inside a Modal.
 */
export function CropEditor({ uri, onCancel, onDone, accent, rtl, t, topInset, bottomInset }: Props) {
  const [image, setImage] = useState<EditableImage | null>(null);
  const [failed, setFailed] = useState(false);
  const [box, setBox] = useState<Size | null>(null);
  const [turns, setTurns] = useState(0);
  const [aspect, setAspect] = useState<AspectKey>('free');
  const [flipped, setFlipped] = useState(false); // 4:5 -> 5:4 on a second tap
  const [rect, setRect] = useState<Rect | null>(null);
  const [saving, setSaving] = useState(false);
  const startRef = useRef<Rect | null>(null);
  // Gestures read the latest frame through a ref so they need not be rebuilt on every move.
  const rectRef = useRef<Rect | null>(null);
  rectRef.current = rect;

  useEffect(() => {
    let live = true;
    normalizeForEditing(uri).then((n) => { if (live) setImage(n); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [uri]);

  const ratio = useMemo(() => {
    const base = ASPECTS[aspect];
    return base && flipped ? 1 / base : base;
  }, [aspect, flipped]);

  const turned = image ? rotatedSize({ w: image.width, h: image.height }, turns) : null;
  const fit = useMemo(() => (turned && box ? fitContain(turned, box) : null), [turned?.w, turned?.h, box?.w, box?.h]);
  const bounds: Size | null = fit ? { w: fit.w, h: fit.h } : null;

  // A new image size, rotation or aspect starts the frame over.
  useEffect(() => {
    if (bounds) setRect(initialCrop(bounds, ratio));
  }, [bounds?.w, bounds?.h, ratio]);

  const gestures = useMemo(() => {
    if (!bounds) return null;
    const begin = () => { startRef.current = rectRef.current; };
    const body = Gesture.Pan().runOnJS(true)
      .onBegin(begin)
      .onUpdate((e) => { if (startRef.current) setRect(moveRect(startRef.current, e.translationX, e.translationY, bounds)); });
    const corners = Object.fromEntries(CORNERS.map((c) => [
      c,
      Gesture.Pan().runOnJS(true)
        .onBegin(begin)
        .onUpdate((e) => {
          if (startRef.current) setRect(resizeCorner(startRef.current, c, e.translationX, e.translationY, bounds, ratio, MIN_CROP));
        }),
    ])) as Record<Corner, ReturnType<typeof Gesture.Pan>>;
    return { body, corners };
  }, [bounds?.w, bounds?.h, ratio]);

  function pickAspect(next: AspectKey) {
    if (next === aspect && next !== 'free' && next !== '1:1') setFlipped((f) => !f);
    else { setAspect(next); setFlipped(false); }
  }

  function reset() {
    setTurns(0);
    setAspect('free');
    setFlipped(false);
    if (image && box) setRect(initialCrop(fitContain(rotatedSize({ w: image.width, h: image.height }, 0), box), null));
  }

  async function done() {
    if (!image || !fit || !rect || !turned || saving) return;
    const crop = toPixelCrop(rect, fit.scale, turned);
    if (turns % 4 === 0 && coversWholeImage(crop, turned)) { onCancel(); return; }
    setSaving(true);
    try {
      onDone(await applyCrop(image.uri, { quarterTurns: turns, crop }));
    } catch {
      setSaving(false);
      setFailed(true);
    }
  }

  const row = rtl ? 'row-reverse' : 'row';
  const odd = turns % 2 === 1;

  return (
    <GestureHandlerRootView style={styles.root} testID="crop-editor">
      <View style={[styles.topBar, { paddingTop: topInset + 12, flexDirection: row }]}>
        <TouchableOpacity onPress={onCancel} accessibilityRole="button" accessibilityLabel={t('media.video_cancel')} testID="crop-cancel" hitSlop={10}>
          <X size={26} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity onPress={reset} accessibilityRole="button" testID="crop-reset" hitSlop={10}>
          <AppText weight="semiBold" style={styles.topText}>{t('chats.crop_reset')}</AppText>
        </TouchableOpacity>
      </View>

      <View style={styles.stage} onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} testID="crop-stage">
        {failed ? (
          <AppText style={styles.topText}>{t('chats.crop_failed')}</AppText>
        ) : !image || !fit || !rect || !gestures ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <View style={{ position: 'absolute', left: fit.x, top: fit.y, width: fit.w, height: fit.h }}>
            <Image
              source={{ uri: image.uri }}
              resizeMode="stretch"
              style={{
                position: 'absolute',
                width: odd ? fit.h : fit.w,
                height: odd ? fit.w : fit.h,
                left: (fit.w - (odd ? fit.h : fit.w)) / 2,
                top: (fit.h - (odd ? fit.w : fit.h)) / 2,
                transform: [{ rotate: `${turns * 90}deg` }],
              }}
            />
            {/* Dim everything outside the frame */}
            <View pointerEvents="none" style={[styles.dim, { left: 0, top: 0, width: fit.w, height: rect.y }]} />
            <View pointerEvents="none" style={[styles.dim, { left: 0, top: rect.y + rect.h, width: fit.w, height: fit.h - rect.y - rect.h }]} />
            <View pointerEvents="none" style={[styles.dim, { left: 0, top: rect.y, width: rect.x, height: rect.h }]} />
            <View pointerEvents="none" style={[styles.dim, { left: rect.x + rect.w, top: rect.y, width: fit.w - rect.x - rect.w, height: rect.h }]} />
            <GestureDetector gesture={gestures.body}>
              <View testID="crop-frame" style={[styles.frame, { left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderColor: '#fff' }]}>
                <View pointerEvents="none" style={[styles.gridV, { left: '33.3%' }]} />
                <View pointerEvents="none" style={[styles.gridV, { left: '66.6%' }]} />
                <View pointerEvents="none" style={[styles.gridH, { top: '33.3%' }]} />
                <View pointerEvents="none" style={[styles.gridH, { top: '66.6%' }]} />
              </View>
            </GestureDetector>
            {CORNERS.map((c) => {
              const cx = c === 'tl' || c === 'bl' ? rect.x : rect.x + rect.w;
              const cy = c === 'tl' || c === 'tr' ? rect.y : rect.y + rect.h;
              return (
                <GestureDetector key={c} gesture={gestures.corners[c]}>
                  <View testID={`crop-handle-${c}`} style={[styles.handleHit, { left: cx - HANDLE / 2, top: cy - HANDLE / 2 }]}>
                    <View style={[styles.handleDot, { backgroundColor: '#fff', borderColor: accent }]} />
                  </View>
                </GestureDetector>
              );
            })}
          </View>
        )}
      </View>

      <View style={[styles.bottomBar, { paddingBottom: bottomInset + 12 }]}>
        <View style={[styles.presets, { flexDirection: row }]}>
          {PRESETS.map((p) => {
            const active = p === aspect;
            const label = p === 'free' ? t('chats.crop_free') : flipped && active ? p.split(':').reverse().join(':') : p;
            return (
              <TouchableOpacity
                key={p}
                onPress={() => pickAspect(p)}
                testID={`crop-aspect-${p}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.chip, active && { backgroundColor: accent, borderColor: accent }]}
              >
                <AppText weight="semiBold" style={styles.chipText}>{label}</AppText>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={[styles.actions, { flexDirection: row }]}>
          <TouchableOpacity
            onPress={() => setTurns((n) => (n + 1) % 4)}
            testID="crop-rotate"
            accessibilityRole="button"
            accessibilityLabel={t('chats.crop_rotate')}
            hitSlop={10}
            disabled={!image}
          >
            <RotateCw size={26} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={done}
            testID="crop-done"
            accessibilityRole="button"
            disabled={!image || saving}
            style={[styles.doneBtn, { backgroundColor: accent, opacity: !image || saving ? 0.5 : 1, flexDirection: row }]}
          >
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Check size={20} color="#fff" strokeWidth={2.5} />}
            <AppText weight="bold" style={styles.doneText}>{t('chats.crop_done')}</AppText>
          </TouchableOpacity>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: '#000', zIndex: 10 },
  topBar: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  topText: { color: '#fff', fontSize: 15 },
  stage: { flex: 1, overflow: 'hidden' },
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  frame: { position: 'absolute', borderWidth: 1.5 },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.5)' },
  gridH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.5)' },
  handleHit: { position: 'absolute', width: HANDLE, height: HANDLE, alignItems: 'center', justifyContent: 'center' },
  handleDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  bottomBar: { paddingHorizontal: 16, paddingTop: 12, gap: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.2)' },
  presets: { gap: 8, justifyContent: 'center' },
  chip: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 },
  chipText: { color: '#fff', fontSize: 13 },
  actions: { alignItems: 'center', justifyContent: 'space-between' },
  doneBtn: { alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10 },
  doneText: { color: '#fff', fontSize: 15 },
});
