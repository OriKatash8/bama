import { useState, useRef } from 'react';
import {
  Modal, View, TouchableOpacity, TextInput,
  StyleSheet, ScrollView, ActivityIndicator, useWindowDimensions, PanResponder,
} from 'react-native';
import { AppText } from '@components/ui/AppText';
import { Image } from 'expo-image';

const BLUE_CAM = require('../../../../assets/images/categories/blue-cam.png');
import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useCreateListing } from '../hooks/useCreateListing';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { MarketplaceListingType, ProductCondition } from '../types';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

const CATEGORIES: { id: string; labelKey: string }[] = [
  { id: 'camera',      labelKey: 'category_camera' },
  { id: 'lens',        labelKey: 'category_lens' },
  { id: 'audio',       labelKey: 'category_audio' },
  { id: 'lighting',    labelKey: 'category_light' },
  { id: 'drone',       labelKey: 'category_drone' },
  { id: 'studio',      labelKey: 'category_studio' },
  { id: 'accessories', labelKey: 'category_accessories' },
  { id: 'other',       labelKey: 'category_other' },
];

const CONDITIONS: { value: ProductCondition; color: string }[] = [
  { value: 'new',      color: '#43a047' },
  { value: 'like_new', color: '#00897b' },
  { value: 'good',     color: '#fb8c00' },
  { value: 'fair',     color: '#e53935' },
];

const SUBCATEGORIES: Record<string, readonly string[]> = {
  camera:   ['Video Camera', 'Photo Camera', 'Cinema Camera', 'Action Camera', 'Mirrorless Camera', 'DSLR Camera'],
  lens:     ['Photo Lens', 'Video/Cinema Lens', 'Anamorphic Lens', 'Macro Lens', 'Wide Angle Lens', 'Telephoto Lens', 'Zoom Lens'],
  audio:    ['Microphone', 'Recorder', 'Mixer', 'Headphones', 'Speaker', 'Wireless System', 'Boom Pole'],
  lighting: ['LED Panel', 'Strobe/Flash', 'Continuous Light', 'Ring Light', 'Fresnel Light', 'Softbox', 'Reflector'],
  drone:    ['Photo Drone', 'Video Drone', 'FPV Drone', 'Drone Accessory'],
  studio:   ['Studio Light', 'Backdrop', 'Grip Equipment', 'Monitor', 'Stabilizer', 'Tripod', 'Slider'],
};

const DEFAULT_BRANDS: readonly string[] = ['Other'];

const CAMERA_VIDEO_CINEMA_BRANDS: readonly string[] = ['Sony', 'Canon', 'Blackmagic', 'RED', 'ARRI', 'Panasonic', 'Nikon', 'Fujifilm', 'JVC', 'Other'];
const CAMERA_PHOTO_BRANDS: readonly string[]        = ['Sony', 'Canon', 'Nikon', 'Fujifilm', 'Leica', 'Hasselblad', 'Olympus', 'Pentax', 'Other'];
const CAMERA_ACTION_BRANDS: readonly string[]       = ['GoPro', 'DJI', 'Insta360', 'Sony', 'Other'];
const LENS_PHOTO_BRANDS: readonly string[]          = ['Canon', 'Nikon', 'Sony', 'Sigma', 'Tamron', 'Zeiss', 'Samyang', 'Tokina', 'Fujifilm', 'Other'];
const LENS_CINEMA_BRANDS: readonly string[]         = ['Zeiss', 'Cooke', 'Leica', 'Sigma', 'Tokina', 'ARRI', 'Canon', 'Rokinon', 'Other'];
const AUDIO_MIC_BRANDS: readonly string[]           = ['Sennheiser', 'Rode', 'Shure', 'Audio-Technica', 'Sony', 'Neumann', 'DPA', 'Schoeps', 'Other'];
const AUDIO_RECORDER_BRANDS: readonly string[]      = ['Sound Devices', 'Zoom', 'Tascam', 'Roland', 'Nagra', 'Other'];
const AUDIO_MIXER_BRANDS: readonly string[]         = ['Sound Devices', 'Zoom', 'Behringer', 'Yamaha', 'Allen & Heath', 'Other'];
const AUDIO_HEADPHONES_BRANDS: readonly string[]    = ['Sony', 'Sennheiser', 'Audio-Technica', 'Beyerdynamic', 'AKG', 'Other'];
const AUDIO_WIRELESS_BRANDS: readonly string[]      = ['Sennheiser', 'Rode', 'Sony', 'Shure', 'Lectrosonics', 'Zaxcom', 'Other'];
const LIGHT_LED_PANEL_BRANDS: readonly string[]     = ['Aputure', 'Nanlite', 'Godox', 'Litepanels', 'Arri', 'Kino Flo', 'Other'];
const LIGHT_STROBE_BRANDS: readonly string[]        = ['Profoto', 'Godox', 'Broncolor', 'Elinchrom', 'Hensel', 'Other'];
const LIGHT_CONTINUOUS_BRANDS: readonly string[]    = ['Arri', 'Kino Flo', 'Aputure', 'Mole-Richardson', 'Other'];
const LIGHT_RING_BRANDS: readonly string[]          = ['Godox', 'Neewer', 'Elgato', 'Aputure', 'Other'];
const DRONE_PHOTO_VIDEO_BRANDS: readonly string[]   = ['DJI', 'Autel', 'Parrot', 'Skydio', 'Other'];
const DRONE_FPV_BRANDS: readonly string[]           = ['DJI', 'IFlight', 'Geprc', 'BetaFPV', 'Other'];
const STUDIO_STABILIZER_BRANDS: readonly string[]   = ['DJI', 'Zhiyun', 'Moza', 'Ikan', 'Other'];
const STUDIO_TRIPOD_BRANDS: readonly string[]       = ['Manfrotto', 'Gitzo', 'Benro', 'Sachtler', 'Miller', 'Other'];
const STUDIO_MONITOR_BRANDS: readonly string[]      = ['SmallHD', 'Atomos', 'Blackmagic', 'Feelworld', 'Other'];
const STUDIO_GRIP_BRANDS: readonly string[]         = ['Matthews', 'Kupo', 'Kessler', 'Rhino', 'Other'];

const BRANDS_BY_CATEGORY: Record<string, Record<string, readonly string[]>> = {
  camera: {
    'Video Camera':     CAMERA_VIDEO_CINEMA_BRANDS,
    'Cinema Camera':    CAMERA_VIDEO_CINEMA_BRANDS,
    'Photo Camera':     CAMERA_PHOTO_BRANDS,
    'Mirrorless Camera':CAMERA_PHOTO_BRANDS,
    'DSLR Camera':      CAMERA_PHOTO_BRANDS,
    'Action Camera':    CAMERA_ACTION_BRANDS,
  },
  lens: {
    'Photo Lens':       LENS_PHOTO_BRANDS,
    'Macro Lens':       LENS_PHOTO_BRANDS,
    'Wide Angle Lens':  LENS_PHOTO_BRANDS,
    'Telephoto Lens':   LENS_PHOTO_BRANDS,
    'Zoom Lens':        LENS_PHOTO_BRANDS,
    'Video/Cinema Lens':LENS_CINEMA_BRANDS,
    'Anamorphic Lens':  LENS_CINEMA_BRANDS,
  },
  audio: {
    Microphone:         AUDIO_MIC_BRANDS,
    Recorder:           AUDIO_RECORDER_BRANDS,
    Mixer:              AUDIO_MIXER_BRANDS,
    Headphones:         AUDIO_HEADPHONES_BRANDS,
    'Wireless System':  AUDIO_WIRELESS_BRANDS,
  },
  lighting: {
    'LED Panel':        LIGHT_LED_PANEL_BRANDS,
    'Strobe/Flash':     LIGHT_STROBE_BRANDS,
    'Continuous Light': LIGHT_CONTINUOUS_BRANDS,
    'Fresnel Light':    LIGHT_CONTINUOUS_BRANDS,
    'Ring Light':       LIGHT_RING_BRANDS,
  },
  drone: {
    'Photo Drone':      DRONE_PHOTO_VIDEO_BRANDS,
    'Video Drone':      DRONE_PHOTO_VIDEO_BRANDS,
    'FPV Drone':        DRONE_FPV_BRANDS,
  },
  studio: {
    Stabilizer:         STUDIO_STABILIZER_BRANDS,
    Tripod:             STUDIO_TRIPOD_BRANDS,
    Monitor:            STUDIO_MONITOR_BRANDS,
    Backdrop:           STUDIO_GRIP_BRANDS,
    'Grip Equipment':   STUDIO_GRIP_BRANDS,
    Slider:             STUDIO_GRIP_BRANDS,
  },
};

function getBrandOptions(category: string, subcategory: string): readonly string[] {
  return BRANDS_BY_CATEGORY[category]?.[subcategory] ?? DEFAULT_BRANDS;
}

type Props = {
  visible: boolean;
  initialType: MarketplaceListingType;
  lockedType?: boolean;
  onClose: () => void;
};

export function PostListingSheet({ visible, initialType, lockedType = false, onClose }: Props) {
  const { height: screenHeight } = useWindowDimensions();
  const { create, isSubmitting } = useCreateListing();

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 8 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderRelease: (_, gs) => { if (gs.dy > 80) onClose(); },
    })
  ).current;
  const { showToast } = useUiStore();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const [type, setType]               = useState<MarketplaceListingType>(initialType);
  const [imageUri, setImageUri]       = useState<string | null>(null);
  const [productName, setProductName] = useState('');
  const [category, setCategory]       = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [brand, setBrand]             = useState('');
  const [customBrand, setCustomBrand] = useState('');
  const [condition, setCondition]     = useState<ProductCondition | null>(null);
  const [location, setLocation]       = useState('');
  const [price, setPrice]             = useState('');

  const subcategoryOptions  = category ? SUBCATEGORIES[category] : undefined;
  const hasSubcategoryStep  = subcategoryOptions !== undefined;

  const canSubmit =
    productName.trim().length > 0 &&
    category.length > 0 &&
    location.trim().length > 0 &&
    Number(price) > 0 &&
    !isSubmitting;

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as const,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  }

  function reset() {
    setImageUri(null); setProductName(''); setCategory('');
    setSubcategory(''); setBrand(''); setCustomBrand(''); setCondition(null);
    setLocation(''); setPrice('');
  }

  function handleCategorySelect(id: string) {
    setCategory(id); setSubcategory(''); setBrand(''); setCustomBrand('');
  }

  function handleSubcategorySelect(sub: string) {
    setSubcategory(sub); setBrand(''); setCustomBrand('');
  }

  async function handleSubmit() {
    try {
      await create({
        type,
        productName: productName.trim(),
        location: location.trim(),
        price: Number(price),
        imageUri,
        condition,
        category,
        subcategory,
        brand: brand === 'Other' ? customBrand.trim() : brand,
      });
      showToast(t('marketplace.listing_posted'), 'success');
      reset();
      onClose();
    } catch {
      showToast(t('marketplace.failed_post'), 'error');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.sheetWrapper, { maxHeight: screenHeight * 0.88 }]}>

        <LinearGradient
          colors={['#efd4f6', '#b7cae6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.card}
        >
          {/* Drag handle */}
          <View style={styles.dragHandleArea} {...panResponder.panHandlers}>
            <View style={styles.dragHandle} />
          </View>

          {/* Header */}
          <View style={[styles.header, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <AppText weight="bold" style={[styles.title, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('marketplace.post_listing')}
            </AppText>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={20} color="#004aad" />
            </TouchableOpacity>
          </View>

          {/* Scrollable form */}
          <ScrollView
            style={[styles.scroll, { maxHeight: screenHeight * 0.88 - 130 }]}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Type toggle */}
            {!lockedType && (
              <View style={styles.toggle}>
                <TouchableOpacity
                  style={[styles.pill, type === 'secondhand' && styles.pillActive]}
                  onPress={() => setType('secondhand')}
                  activeOpacity={0.8}
                >
                  <AppText weight="semiBold" style={[styles.pillLabel, type === 'secondhand' && styles.pillLabelActive]}>
                    {t('marketplace.second_hand')}
                  </AppText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pill, type === 'rental' && styles.pillActive]}
                  onPress={() => setType('rental')}
                  activeOpacity={0.8}
                >
                  <AppText weight="semiBold" style={[styles.pillLabel, type === 'rental' && styles.pillLabelActive]}>
                    {t('marketplace.rental')}
                  </AppText>
                </TouchableOpacity>
              </View>
            )}

            {/* Image */}
            <TouchableOpacity style={styles.imagePicker} onPress={pickImage} activeOpacity={0.8}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.previewImage} />
              ) : (
                <View style={styles.imagePickerPlaceholder}>
                  <Image
                    source={BLUE_CAM}
                    style={styles.cameraIcon}
                  />
                  <AppText weight="regular" style={styles.imagePickerLabel}>{t('marketplace.upload_photo')}</AppText>
                </View>
              )}
            </TouchableOpacity>

            {/* Product name */}
            <TextInput
              style={[styles.input, { textAlign: rtl ? 'right' : 'left' }]}
              placeholder={t('marketplace.product_name')}
              placeholderTextColor="rgba(0,0,0,0.3)"
              value={productName}
              onChangeText={setProductName}
            />

            {/* Category */}
            <AppText weight="bold" style={[styles.sectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('marketplace.category')}
            </AppText>
            <View style={styles.grid}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catChip, category === cat.id && styles.catChipActive]}
                  onPress={() => handleCategorySelect(cat.id)}
                  activeOpacity={0.8}
                >
                  <AppText weight="semiBold" style={[styles.catLabel, category === cat.id && styles.catLabelActive]}>
                    {t(`marketplace.${cat.labelKey}`)}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>

            {/* Subcategory */}
            {hasSubcategoryStep && subcategoryOptions && (
              <>
                <AppText weight="bold" style={[styles.sectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                  {t('marketplace.subcategory')}
                </AppText>
                <View style={styles.chipRow}>
                  {subcategoryOptions.map((sub) => (
                    <TouchableOpacity
                      key={sub}
                      style={[styles.chip, subcategory === sub && styles.chipActive]}
                      onPress={() => handleSubcategorySelect(sub)}
                      activeOpacity={0.8}
                    >
                      <AppText weight="semiBold" style={[styles.chipLabel, subcategory === sub && styles.chipLabelActive]}>
                        {sub}
                      </AppText>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Brand */}
            {hasSubcategoryStep ? (
              subcategory.length > 0 && (
                <>
                  <AppText weight="bold" style={[styles.sectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                    {t('marketplace.brand')}
                  </AppText>
                  <View style={styles.chipRow}>
                    {getBrandOptions(category, subcategory).map((b) => (
                      <TouchableOpacity
                        key={b}
                        style={[styles.chip, brand === b && styles.chipActive]}
                        onPress={() => { setBrand(b); if (b !== 'Other') setCustomBrand(''); }}
                        activeOpacity={0.8}
                      >
                        <AppText weight="semiBold" style={[styles.chipLabel, brand === b && styles.chipLabelActive]}>{b}</AppText>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {brand === 'Other' && (
                    <TextInput
                      style={[styles.input, { textAlign: rtl ? 'right' : 'left', marginTop: -2 }]}
                      placeholder={rtl ? 'שם החברה / המותג' : 'Brand / company name'}
                      placeholderTextColor="rgba(0,0,0,0.3)"
                      value={customBrand}
                      onChangeText={setCustomBrand}
                      autoFocus
                    />
                  )}
                </>
              )
            ) : (
              category.length > 0 && (
                <TextInput
                  style={[styles.input, { textAlign: rtl ? 'right' : 'left' }]}
                  placeholder={t('marketplace.brand_placeholder')}
                  placeholderTextColor="rgba(0,0,0,0.3)"
                  value={brand}
                  onChangeText={setBrand}
                />
              )
            )}

            {/* Condition (secondhand only) */}
            {type === 'secondhand' && (
              <>
                <AppText weight="bold" style={[styles.sectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                  {t('marketplace.condition')}
                </AppText>
                <View style={styles.conditionRow}>
                  {CONDITIONS.map((c) => (
                    <TouchableOpacity
                      key={c.value}
                      style={[
                        styles.conditionChip,
                        condition === c.value && { backgroundColor: c.color, borderColor: c.color },
                      ]}
                      onPress={() => setCondition(condition === c.value ? null : c.value)}
                      activeOpacity={0.8}
                    >
                      <AppText weight="semiBold" style={[styles.conditionLabel, condition === c.value && { color: '#fff' }]}>
                        {t(`marketplace.condition_${c.value}`)}
                      </AppText>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Location */}
            <TextInput
              style={[styles.input, { textAlign: rtl ? 'right' : 'left' }]}
              placeholder={t('marketplace.location_city')}
              placeholderTextColor="rgba(0,0,0,0.3)"
              value={location}
              onChangeText={setLocation}
            />

            {/* Price */}
            <TextInput
              style={[styles.input, { textAlign: rtl ? 'right' : 'left' }]}
              placeholder={type === 'rental' ? t('marketplace.price_per_day') : t('marketplace.price_ils')}
              placeholderTextColor="rgba(0,0,0,0.3)"
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
            />

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit && styles.disabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              activeOpacity={0.8}
            >
              {isSubmitting
                ? <ActivityIndicator color="#fff" />
                : <AppText weight="bold" style={styles.submitText}>{t('marketplace.post_listing_btn')}</AppText>}
            </TouchableOpacity>
          </ScrollView>
        </LinearGradient>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetWrapper: {
    width: '100%',
    overflow: 'hidden',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  card: {
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },
  dragHandleArea: { alignItems: 'center', paddingVertical: 8 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.18)' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#004aad',
    paddingRight: 8,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {},
  scrollContent: { paddingBottom: 100 },

  toggle: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  pill: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingVertical: 8,
    alignItems: 'center',
  },
  pillActive: { backgroundColor: '#cb6ce6' },
  pillLabel: { fontSize: 14, fontWeight: '600', color: 'rgba(0,0,0,0.4)' },
  pillLabelActive: { color: '#fff' },

  imagePicker: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,74,173,0.3)',
    marginBottom: 12,
    overflow: 'hidden',
  },
  previewImage: { width: '100%', height: 100 },
  imagePickerPlaceholder: { flexDirection: 'row', alignItems: 'center' },
  cameraIcon: { width: 40, height: 40, marginRight: 8 },
  imagePickerLabel: { fontSize: 13, color: 'rgba(0,0,0,0.4)' },

  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#1a1a2e',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.15)',
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#cb6ce6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.12)',
  },
  catChipActive: { backgroundColor: '#004aad', borderColor: '#004aad' },
  catLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(0,0,0,0.5)' },
  catLabelActive: { color: '#fff' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.15)',
    backgroundColor: '#ffffff',
  },
  chipActive: { backgroundColor: '#004aad', borderColor: '#004aad' },
  chipLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(0,0,0,0.5)' },
  chipLabelActive: { color: '#fff' },

  conditionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  conditionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(0,74,173,0.2)',
    backgroundColor: '#ffffff',
  },
  conditionLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(0,0,0,0.5)' },

  submitBtn: {
    backgroundColor: '#004aad',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  disabled: { opacity: 0.4 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
