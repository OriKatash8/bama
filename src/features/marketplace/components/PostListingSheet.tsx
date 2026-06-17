import { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput,
  StyleSheet, Platform, ScrollView, ActivityIndicator, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useCreateListing } from '../hooks/useCreateListing';
import { useUiStore } from '@core/stores/uiStore';
import type { MarketplaceListingType } from '../types';

type Props = {
  visible: boolean;
  initialType: MarketplaceListingType;
  onClose: () => void;
};

export function PostListingSheet({ visible, initialType, onClose }: Props) {
  const { create, isSubmitting } = useCreateListing();
  const { showToast } = useUiStore();
  const [type, setType] = useState<MarketplaceListingType>(initialType);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [productName, setProductName] = useState('');
  const [location, setLocation] = useState('');
  const [price, setPrice] = useState('');

  const canSubmit =
    productName.trim().length > 0 &&
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

  async function handleSubmit() {
    try {
      await create({
        type,
        productName: productName.trim(),
        location: location.trim(),
        price: Number(price),
        imageUri,
      });
      showToast('Listing posted!', 'success');
      setProductName('');
      setLocation('');
      setPrice('');
      setImageUri(null);
      onClose();
    } catch {
      showToast('Failed to post listing', 'error');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, Platform.OS === 'web' && (webSheet as any)]}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Post a Listing</Text>

          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.pill, type === 'secondhand' && styles.pillActive]}
              onPress={() => setType('secondhand')}
              activeOpacity={0.8}
            >
              <Text style={[styles.pillLabel, type === 'secondhand' && styles.pillLabelActive]}>
                2nd Hand
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pill, type === 'rental' && styles.pillActive]}
              onPress={() => setType('rental')}
              activeOpacity={0.8}
            >
              <Text style={[styles.pillLabel, type === 'rental' && styles.pillLabelActive]}>
                Rental
              </Text>
            </TouchableOpacity>
          </View>

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

          <TextInput
            style={styles.input}
            placeholder="Product name"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={productName}
            onChangeText={setProductName}
          />
          <TextInput
            style={styles.input}
            placeholder="Location (city)"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={location}
            onChangeText={setLocation}
          />
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
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0f0f1f',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#ffffff18',
    padding: 20,
    paddingBottom: 36,
    maxHeight: '85%',
  },
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
