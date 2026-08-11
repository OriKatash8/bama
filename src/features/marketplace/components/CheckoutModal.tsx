import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { AppText } from '@components/ui/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    if (typeof result !== 'string') return key;
    if (!vars) return result;
    return result.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
  };
}

type Props = {
  visible: boolean;
  productName: string;
  price: number;
  platformFee: number;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function CheckoutModal({
  visible, productName, price, platformFee, isLoading, onConfirm, onCancel,
}: Props) {
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const { height: screenHeight } = useWindowDimensions();

  const rowDir = rtl ? 'row-reverse' : 'row' as const;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onCancel} />
        <LinearGradient
          colors={['#efd4f6', '#b7cae6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.card, { maxHeight: screenHeight * 0.8 }]}
        >
          {/* Header */}
          <View style={[styles.header, { flexDirection: rowDir }]}>
            <AppText weight="bold" style={[styles.title, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('marketplace.checkout_title')}
            </AppText>
            <TouchableOpacity onPress={onCancel} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={20} color="#004aad" />
            </TouchableOpacity>
          </View>

          {/* Product row */}
          <View style={[styles.row, { flexDirection: rowDir }]}>
            <View style={{ flex: 1 }}>
              <AppText weight="semiBold" style={[styles.productName, { textAlign: rtl ? 'right' : 'left' }]} numberOfLines={2}>
                {productName}
              </AppText>
              <AppText weight="regular" style={[styles.priceNote, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('marketplace.seller_price_note')}
              </AppText>
            </View>
            <Text style={styles.amount}>
              ₪{price.toLocaleString()}
            </Text>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Platform fee row */}
          <View style={[styles.row, { flexDirection: rowDir }]}>
            <AppText weight="medium" style={[styles.feeLabel, { textAlign: rtl ? 'right' : 'left', flex: 1 }]}>
              {t('marketplace.platform_fee')}
            </AppText>
            <Text style={styles.feeAmount}>
              ₪{platformFee.toLocaleString()}
            </Text>
          </View>

          {/* Note */}
          <AppText weight="regular" style={[styles.note, { textAlign: rtl ? 'right' : 'left' }]}>
            {t('marketplace.fee_note')}
          </AppText>

          {/* Buttons */}
          <View style={[styles.btnRow, { flexDirection: rowDir }]}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={isLoading} activeOpacity={0.7}>
              <AppText weight="semiBold" style={styles.cancelText}>
                {t('common.cancel')}
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, isLoading && styles.disabledBtn]}
              onPress={onConfirm}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading
                ? <ActivityIndicator color="#fff" />
                : <AppText weight="bold" style={styles.confirmText}>
                    {t('marketplace.confirm_purchase')}
                  </AppText>}
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    width: '90%',
    borderRadius: 24,
    padding: 24,
    gap: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: '#004aad',
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 12,
    padding: 14,
  },
  productName: {
    fontSize: 15,
    color: '#004aad',
    fontWeight: '600',
  },
  priceNote: {
    fontSize: 11,
    color: '#004aad99',
    marginTop: 2,
  },
  amount: {
    fontSize: 18,
    color: '#004aad',
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,74,173,0.15)',
    marginVertical: 4,
  },
  feeLabel: {
    fontSize: 14,
    color: '#004aad',
  },
  feeAmount: {
    fontSize: 16,
    color: '#004aad',
    fontWeight: '700',
  },
  note: {
    fontSize: 12,
    color: '#004aad99',
    lineHeight: 17,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.2)',
  },
  cancelText: {
    fontSize: 15,
    color: '#004aad',
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 2,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#004aad',
  },
  disabledBtn: { opacity: 0.6 },
  confirmText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '700',
  },
});
