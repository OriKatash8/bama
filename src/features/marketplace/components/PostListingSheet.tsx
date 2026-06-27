import { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput, Pressable,
  StyleSheet, Platform, ScrollView, ActivityIndicator, Image, Dimensions,
} from 'react-native';

const SHEET_HEIGHT = Dimensions.get('window').height * 0.88;
import * as ImagePicker from 'expo-image-picker';
import { useCreateListing } from '../hooks/useCreateListing';
import { useUiStore } from '@core/stores/uiStore';
import type { MarketplaceListingType, ProductCondition } from '../types';

const CATEGORIES = [
  { id: 'camera', emoji: '📷', label: 'Camera' },
  { id: 'lens', emoji: '🔭', label: 'Lens' },
  { id: 'audio', emoji: '🎤', label: 'Audio' },
  { id: 'lighting', emoji: '💡', label: 'Lighting' },
  { id: 'drone', emoji: '🚁', label: 'Drone' },
  { id: 'studio', emoji: '🎬', label: 'Studio' },
  { id: 'accessories', emoji: '🎒', label: 'Accessories' },
  { id: 'other', emoji: '📦', label: 'Other' },
];

const CONDITIONS: { value: ProductCondition; label: string; color: string }[] = [
  { value: 'new', label: 'New', color: '#43a047' },
  { value: 'like_new', label: 'Like New', color: '#00897b' },
  { value: 'good', label: 'Good', color: '#fb8c00' },
  { value: 'fair', label: 'Fair', color: '#e53935' },
];

type Props = {
  visible: boolean;
  initialType: MarketplaceListingType;
  lockedType?: boolean;
  onClose: () => void;
};

export function PostListingSheet({ visible, initialType, lockedType = false, onClose }: Props) {
  const { create, isSubmitting } = useCreateListing();
  const { showToast } = useUiStore();

  const [type, setType] = useState<MarketplaceListingType>(initialType);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState<ProductCondition | null>(null);
  const [location, setLocation] = useState('');
  const [price, setPrice] = useState('');

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
    setImageUri(null);
    setProductName('');
    setBrand('');
    setCategory('');
    setCondition(null);
    setLocation('');
    setPrice('');
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
        brand,
      });
      showToast('Listing posted!', 'success');
      reset();
      onClose();
    } catch {
      showToast('Failed to post listing', 'error');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdropArea} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, Platform.OS === 'web' && (webSheet as any)]}>
          <View style={styles.handle} />
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Post a Listing</Text>

          {/* Type toggle — hidden when type is locked to the active tab */}
          {!lockedType && (
            <View style={styles.toggle}>
              <TouchableOpacity
                style={[styles.pill, type === 'secondhand' && styles.pillActive]}
                onPress={() => setType('secondhand')}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillLabel, type === 'secondhand' && styles.pillLabelActive]}>2nd Hand</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pill, type === 'rental' && styles.pillActive]}
                onPress={() => setType('rental')}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillLabel, type === 'rental' && styles.pillLabelActive]}>Rental</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Image */}
          <TouchableOpacity style={styles.imagePicker} onPress={pickImage} activeOpacity={0.8}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.previewImage} />
            ) : (
              <>
                <Text style={styles.imagePickerIcon}>📷</Text>
                <Text style={styles.imagePickerLabel}>Upload Photo</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Product name */}
          <TextInput
            style={styles.input}
            placeholder="Product name"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={productName}
            onChangeText={setProductName}
          />

          {/* Brand */}
          <TextInput
            style={styles.input}
            placeholder="Brand (e.g. Sony, Canon, DJI)"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={brand}
            onChangeText={setBrand}
          />

          {/* Category */}
          <Text style={styles.sectionLabel}>Category</Text>
          <View style={styles.grid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.catChip, category === cat.id && styles.catChipActive]}
                onPress={() => setCategory(cat.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.catEmoji}>{cat.emoji}</Text>
                <Text style={[styles.catLabel, category === cat.id && styles.catLabelActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Condition (secondhand only) */}
          {type === 'secondhand' && (
            <>
              <Text style={styles.sectionLabel}>Condition</Text>
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
                    <Text style={[styles.conditionLabel, condition === c.value && { color: '#fff' }]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Location */}
          <TextInput
            style={styles.input}
            placeholder="Location (city)"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={location}
            onChangeText={setLocation}
          />

          {/* Price */}
          <TextInput
            style={styles.input}
            placeholder={type === 'rental' ? 'Price per day (₪)' : 'Price (₪)'}
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={price}
            onChangeText={setPrice}
            keyboardType="numeric"
          />

          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.disabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Post Listing</Text>
            )}
          </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const webSheet = {
  maxWidth: 540,
  alignSelf: 'center',
  width: '100%',
  borderRadius: 20,
  bottom: 'auto',
  top: '50%',
  transform: [{ translateY: -50 }],
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  backdropArea: { flex: 1 },
  sheet: {
    height: SHEET_HEIGHT,
    backgroundColor: '#0f0f1f',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#ffffff18',
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 48 },
  handle: {
    width: 40, height: 4,
    backgroundColor: '#ffffff33',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 16 },
  toggle: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  pill: {
    flex: 1,
    backgroundColor: '#2a2a3e',
    borderRadius: 20,
    paddingVertical: 8,
    alignItems: 'center',
  },
  pillActive: { backgroundColor: '#cb6ce6' },
  pillLabel: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  pillLabelActive: { color: '#fff' },
  imagePicker: {
    backgroundColor: '#2a2a3e',
    borderRadius: 12,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#ffffff33',
    marginBottom: 12,
    overflow: 'hidden',
  },
  previewImage: { width: '100%', height: 100 },
  imagePickerIcon: { fontSize: 28, marginBottom: 4 },
  imagePickerLabel: { fontSize: 13, color: 'rgba(255,255,255,0.4)' },
  input: {
    backgroundColor: '#2a2a3e',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#fff',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ffffff12',
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2a2a3e',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#ffffff12',
  },
  catChipActive: { backgroundColor: '#004aad', borderColor: '#004aad' },
  catEmoji: { fontSize: 16 },
  catLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  catLabelActive: { color: '#fff' },
  conditionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  conditionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#ffffff22',
    backgroundColor: '#2a2a3e',
  },
  conditionLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  submitBtn: {
    backgroundColor: '#cb6ce6',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  disabled: { opacity: 0.4 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
