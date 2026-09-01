import { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput,
  StyleSheet, ScrollView, ActivityIndicator, type TextProps,
} from 'react-native';
import { Image } from 'expo-image';

const BLUE_CAM = require('../../../../assets/images/categories/blue-cam.png');
import { X, MapPin } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { CityPickerModal } from './CityPickerModal';
import { useCreateListing } from '../hooks/useCreateListing';
import { useUpdateListing } from '../hooks/useUpdateListing';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { MarketplaceListing, MarketplaceListingType, ProductCondition } from '../types';
import { brandLabel } from '../utils';

type Translations = typeof en;

/** Every string in this sheet follows the APP LANGUAGE rather than the string's
 *  own script (which is what AppText does). In Hebrew mode that keeps the Latin
 *  data — brand and subcategory names — in Heebo instead of falling back to
 *  Montserrat mid-form. */
type SheetTextProps = TextProps & { weight?: 'regular' | 'medium' | 'semiBold' | 'bold' | 'light' };
function SheetText({ weight = 'regular', style, children, ...rest }: SheetTextProps) {
  const font = useAppFont();
  return <Text style={[style, font[weight]]} {...rest}>{children}</Text>;
}

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

/** Union of the brand lists for all selected subcategories, deduped, "Other" last. */
function getBrandOptionsMulti(category: string, subcategories: string[]): readonly string[] {
  if (subcategories.length === 0) return DEFAULT_BRANDS;
  const set = new Set<string>();
  for (const sub of subcategories) {
    for (const b of getBrandOptions(category, sub)) {
      if (b !== 'Other') set.add(b);
    }
  }
  return [...set, 'Other'];
}

type Props = {
  visible: boolean;
  initialType: MarketplaceListingType;
  lockedType?: boolean;
  editListing?: MarketplaceListing;
  onClose: () => void;
};

export function PostListingSheet({ visible, initialType, lockedType = false, editListing, onClose }: Props) {
  const { create, isSubmitting: isCreating } = useCreateListing();
  const { update, isSubmitting: isUpdating } = useUpdateListing();
  const isEditing = !!editListing;
  const isSubmitting = isCreating || isUpdating;

  const { showToast } = useUiStore();
  const language = useSettingsStore((s) => s.language);
  const font = useAppFont();
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const [type, setType]               = useState<MarketplaceListingType>(editListing?.type ?? initialType);
  const [imageUri, setImageUri]       = useState<string | null>(editListing?.imageUrl ?? null);
  const [productName, setProductName] = useState(editListing?.productName ?? '');
  const [category, setCategory]       = useState(editListing?.category ?? '');
  const [subcategory, setSubcategory] = useState<string[]>(
    Array.isArray(editListing?.subcategory)
      ? editListing.subcategory
      : editListing?.subcategory ? [editListing.subcategory] : [],
  );
  const [brand, setBrand]             = useState(editListing?.brand ?? '');
  const [customBrand, setCustomBrand] = useState('');
  const [condition, setCondition]     = useState<ProductCondition | null>(editListing?.condition ?? null);
  const [location, setLocation]       = useState(editListing?.location ?? '');
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [price, setPrice]             = useState(editListing ? String(editListing.price) : '');

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
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  }

  function reset() {
    setImageUri(null); setProductName(''); setCategory('');
    setSubcategory([]); setBrand(''); setCustomBrand(''); setCondition(null);
    setLocation(''); setPrice('');
  }

  function handleCategorySelect(id: string) {
    setCategory(id); setSubcategory([]); setBrand(''); setCustomBrand('');
  }

  // Multi-select: toggle the subcategory in/out. Reset brand since the union of
  // available brands changes with the selection.
  function handleSubcategorySelect(sub: string) {
    setSubcategory((prev) => (prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub]));
    setBrand(''); setCustomBrand('');
  }

  async function handleSubmit() {
    const input = {
      type,
      productName: productName.trim(),
      location: location.trim(),
      price: Number(price),
      imageUri,
      condition,
      category,
      subcategory,
      brand: brand === 'Other' ? customBrand.trim() : brand,
    };
    try {
      if (isEditing && editListing) {
        await update(editListing.id, editListing, input);
        showToast(t('marketplace.listing_updated'), 'success');
      } else {
        await create(input);
        showToast(t('marketplace.listing_posted'), 'success');
        reset();
      }
      onClose();
    } catch {
      showToast(t(isEditing ? 'marketplace.failed_update' : 'marketplace.failed_post'), 'error');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.card}>
          {/* Header */}
          <View style={[styles.header, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <SheetText weight="bold" style={[styles.title, { textAlign: rtl ? 'right' : 'left' }]}>
              {t(isEditing ? 'marketplace.edit_listing_title' : 'marketplace.post_listing')}
            </SheetText>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={20} color="#004aad" />
            </TouchableOpacity>
          </View>

          {/* Scrollable form */}
          <ScrollView
            automaticallyAdjustKeyboardInsets
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Type toggle */}
            {!lockedType && (
              <View style={[styles.toggle, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <TouchableOpacity
                  style={[styles.pill, type === 'secondhand' && styles.pillActive]}
                  onPress={() => setType('secondhand')}
                  activeOpacity={0.8}
                >
                  <SheetText weight="semiBold" style={[styles.pillLabel, type === 'secondhand' && styles.pillLabelActive]}>
                    {t('marketplace.second_hand')}
                  </SheetText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pill, type === 'rental' && styles.pillActive]}
                  onPress={() => setType('rental')}
                  activeOpacity={0.8}
                >
                  <SheetText weight="semiBold" style={[styles.pillLabel, type === 'rental' && styles.pillLabelActive]}>
                    {t('marketplace.rental')}
                  </SheetText>
                </TouchableOpacity>
              </View>
            )}

            {/* Image */}
            <SheetText weight="semiBold" style={[styles.sectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('marketplace.label_image')}
            </SheetText>
            <TouchableOpacity style={styles.imagePicker} onPress={pickImage} activeOpacity={0.8}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.previewImage} />
              ) : (
                <View style={[styles.imagePickerPlaceholder, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <Image
                    source={BLUE_CAM}
                    style={[styles.cameraIcon, rtl ? { marginRight: 0, marginLeft: 8 } : null]}
                  />
                  <SheetText weight="regular" style={styles.imagePickerLabel}>{t('marketplace.upload_photo')}</SheetText>
                </View>
              )}
            </TouchableOpacity>

            {/* Product name */}
            <SheetText weight="semiBold" style={[styles.sectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('marketplace.label_name')}
            </SheetText>
            <TextInput
              style={[styles.input, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}
              placeholder={t('marketplace.product_name')}
              placeholderTextColor="rgba(0,0,0,0.3)"
              value={productName}
              onChangeText={setProductName}
            />

            {/* Category */}
            <SheetText weight="semiBold" style={[styles.sectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('marketplace.category')}
            </SheetText>
            <View style={[styles.grid, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catChip, category === cat.id && styles.catChipActive]}
                  onPress={() => handleCategorySelect(cat.id)}
                  activeOpacity={0.8}
                >
                  <SheetText weight="semiBold" style={[styles.catLabel, category === cat.id && styles.catLabelActive]}>
                    {t(`marketplace.${cat.labelKey}`)}
                  </SheetText>
                </TouchableOpacity>
              ))}
            </View>

            {/* Subcategory */}
            {hasSubcategoryStep && subcategoryOptions && (
              <>
                <SheetText weight="semiBold" style={[styles.sectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                  {t('marketplace.subcategory')}
                </SheetText>
                <View style={[styles.chipRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  {subcategoryOptions.map((sub) => (
                    <TouchableOpacity
                      key={sub}
                      style={[styles.chip, subcategory.includes(sub) && styles.chipActive]}
                      onPress={() => handleSubcategorySelect(sub)}
                      activeOpacity={0.8}
                    >
                      <SheetText weight="semiBold" style={[styles.chipLabel, subcategory.includes(sub) && styles.chipLabelActive]}>
                        {sub}
                      </SheetText>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Brand */}
            {hasSubcategoryStep ? (
              subcategory.length > 0 && (
                <>
                  <SheetText weight="semiBold" style={[styles.sectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                    {t('marketplace.brand')}
                  </SheetText>
                  <View style={[styles.chipRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                    {getBrandOptionsMulti(category, subcategory).map((b) => (
                      <TouchableOpacity
                        key={b}
                        style={[styles.chip, brand === b && styles.chipActive]}
                        onPress={() => { setBrand(b); if (b !== 'Other') setCustomBrand(''); }}
                        activeOpacity={0.8}
                      >
                        <SheetText weight="semiBold" style={[styles.chipLabel, brand === b && styles.chipLabelActive]}>{brandLabel(b, rtl ? 'he' : 'en')}</SheetText>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {brand === 'Other' && (
                    <TextInput
                      style={[styles.input, { ...font.regular, textAlign: rtl ? 'right' : 'left', marginTop: -2 }]}
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
                  style={[styles.input, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}
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
                <SheetText weight="semiBold" style={[styles.sectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                  {t('marketplace.condition')}
                </SheetText>
                <View style={[styles.conditionRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
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
                      <SheetText weight="semiBold" style={[styles.conditionLabel, condition === c.value && { color: '#fff' }]}>
                        {t(`marketplace.condition_${c.value}`)}
                      </SheetText>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Location */}
            <SheetText weight="semiBold" style={[styles.sectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('marketplace.label_location')}
            </SheetText>
            <TouchableOpacity
              style={[styles.input, styles.locationTrigger, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
              onPress={() => setLocationPickerOpen(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <MapPin size={16} color="#004aad" strokeWidth={1.8} />
              <SheetText
                weight="regular"
                style={[styles.locationTriggerText, { textAlign: rtl ? 'right' : 'left', color: location ? '#1a1a2e' : 'rgba(0,0,0,0.3)' }]}
                numberOfLines={1}
              >
                {location || t('marketplace.location_city')}
              </SheetText>
              {location.length > 0 && (
                <TouchableOpacity onPress={() => setLocation('')} hitSlop={8} activeOpacity={0.7}>
                  <X size={14} color="rgba(0,0,0,0.35)" strokeWidth={2.5} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            {/* Price */}
            <SheetText weight="semiBold" style={[styles.sectionLabel, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('marketplace.label_price')}
            </SheetText>
            <View style={[styles.priceRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <TextInput
                style={[styles.input, styles.priceInput, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}
                placeholder={type === 'rental' ? t('marketplace.price_per_day') : t('marketplace.price_ils')}
                placeholderTextColor="rgba(0,0,0,0.3)"
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
              />
              {type === 'rental' && (
                <SheetText weight="semiBold" style={styles.priceSuffix}>{t('marketplace.per_day')}</SheetText>
              )}
            </View>

          </ScrollView>

          {/* Actions — pinned below the scroll, like the filter modal's apply row */}
          <View style={[styles.actions, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit && styles.disabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {isSubmitting
                ? <ActivityIndicator color="#fff" />
                : <SheetText weight="bold" style={styles.submitText}>{t(isEditing ? 'marketplace.save_changes' : 'marketplace.post_listing_btn')}</SheetText>}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <CityPickerModal
        visible={locationPickerOpen}
        value={location}
        onSelect={setLocation}
        onClose={() => setLocationPickerOpen(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Shell mirrors the marketplace filter modal: centred card, fade in,
  // white surface, 24 radius, capped at 85% of the screen.
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },
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
  scroll: { flexShrink: 1 },
  scrollContent: { paddingBottom: 4 },

  toggle: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  pill: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.2)',
    backgroundColor: '#ffffff',
  },
  pillActive: { backgroundColor: '#004aad', borderColor: '#004aad' },
  pillLabel: { fontSize: 13, fontWeight: '600', color: '#004aad' },
  pillLabelActive: { color: '#fff' },

  imagePicker: {
    backgroundColor: 'rgba(0,74,173,0.04)',
    borderRadius: 12,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,74,173,0.3)',
    marginBottom: 16,
    overflow: 'hidden',
  },
  previewImage: { width: '100%', height: 100 },
  imagePickerPlaceholder: { flexDirection: 'row', alignItems: 'center' },
  cameraIcon: { width: 40, height: 40, marginRight: 8 },
  imagePickerLabel: { fontSize: 13, color: 'rgba(15,15,31,0.4)' },

  // Same input treatment as the filter modal's `filterModalInput`.
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#1a1a2e',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.15)',
  },
  locationTrigger: { alignItems: 'center', gap: 8 },
  locationTriggerText: { flex: 1, fontSize: 15 },
  priceRow: { alignItems: 'center', gap: 8, marginBottom: 16 },
  priceInput: { flex: 1, marginBottom: 0 },
  priceSuffix: { fontSize: 15, color: '#004aad' },

  // Filter modal's muted section label, not the purple uppercase one.
  sectionLabel: {
    fontSize: 12,
    color: 'rgba(15,15,31,0.4)',
    marginBottom: 8,
    marginTop: 10,
  },

  // Chips match `filterChip` / `filterChipActive`.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.2)',
    backgroundColor: '#ffffff',
  },
  catChipActive: { backgroundColor: '#004aad', borderColor: '#004aad' },
  catLabel: { fontSize: 13, fontWeight: '600', color: '#004aad' },
  catLabelActive: { color: '#fff' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.2)',
    backgroundColor: '#ffffff',
  },
  chipActive: { backgroundColor: '#004aad', borderColor: '#004aad' },
  chipLabel: { fontSize: 13, fontWeight: '600', color: '#004aad' },
  chipLabelActive: { color: '#fff' },

  // Condition keeps its per-value colour (it carries meaning) in the chip shape.
  conditionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  conditionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.2)',
    backgroundColor: '#ffffff',
  },
  conditionLabel: { fontSize: 13, fontWeight: '600', color: '#004aad' },

  // Mirrors `filterActions` / `filterApplyBtn`.
  actions: { alignItems: 'center', gap: 12, marginTop: 18 },
  submitBtn: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#004aad',
  },
  disabled: { opacity: 0.4 },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
