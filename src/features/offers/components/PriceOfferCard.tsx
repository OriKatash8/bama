import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { getDocument } from '@core/firebase/firestore';
import type { PriceOffer } from '@core/types/project';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';

type Props = {
  offer: PriceOffer;
  onAccept: () => void;
  onReject: () => void;
  isAccepting: boolean;
};

export function PriceOfferCard({ offer, onAccept, onReject, isAccepting }: Props) {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const colors = useTheme();
  const font = useAppFont();

  useEffect(() => {
    getDocument<{ displayName: string }>(`users/${offer.professionalId}`).then((u) => {
      setDisplayName(u?.displayName ?? 'Unknown');
    });
  }, [offer.professionalId]);

  return (
    <View style={[styles.card, { backgroundColor: '#ffffff', borderColor: colors.border }]}>
      <View style={styles.top}>
        <View style={styles.info}>
          <Text style={[styles.name, { color: '#004aad', fontFamily: font.bold }]}>{displayName ?? '…'}</Text>
          <Text style={[styles.role, { color: colors.textSec, fontFamily: font.regular }]}>
            {offer.subcategory}
            <Text style={{ color: colors.textMuted, fontFamily: font.regular }}> · {offer.category}</Text>
          </Text>
          <Text style={[styles.price, { fontFamily: font.bold }]}>${offer.price.toLocaleString()}</Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.acceptBtn, isAccepting && styles.disabled]}
            onPress={onAccept}
            disabled={isAccepting}
            activeOpacity={0.8}
          >
            {isAccepting ? (
              <ActivityIndicator size="small" color="#4caf50" />
            ) : (
              <Text style={[styles.acceptIcon, { fontFamily: font.bold }]}>✓</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={onReject}
            activeOpacity={0.8}
          >
            <Text style={[styles.rejectIcon, { fontFamily: font.bold }]}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 14,
    marginVertical: 5,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  role: { fontSize: 13, marginBottom: 4 },
  price: { fontSize: 16, fontWeight: '800', color: '#cb6ce6' },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: { backgroundColor: 'rgba(76,175,80,0.15)', borderWidth: 1.5, borderColor: '#4caf50' },
  rejectBtn: { backgroundColor: 'rgba(229,57,53,0.15)', borderWidth: 1.5, borderColor: '#e53935' },
  disabled: { opacity: 0.5 },
  acceptIcon: { fontSize: 16, color: '#4caf50', fontWeight: '700' },
  rejectIcon: { fontSize: 14, color: '#e53935', fontWeight: '700' },
});
