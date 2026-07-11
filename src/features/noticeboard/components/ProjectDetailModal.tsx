import { useState, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  StyleSheet, TextInput, Switch,
} from 'react-native';
import { X } from 'lucide-react-native';
import type { ProjectRequest, CrewRequestSlot } from '@core/types/project';
import { usePriceOffer } from '@features/noticeboard/hooks/usePriceOffer';
import { getVacantSlots } from '@features/noticeboard/hooks/useNoticeboard';
import { useTheme } from '@core/hooks/useTheme';

type BidEntry = CrewRequestSlot & { selected: boolean; price: string };

type Props = {
  request: ProjectRequest | null;
  onClose: () => void;
  onApply: () => void;
  onDismiss: () => void;
  isApplying: boolean;
  initialView?: 'details' | 'bid';
};

export function ProjectDetailModal({ request, onClose, onApply, onDismiss, initialView = 'details' }: Props) {
  const { submit, isSubmitting } = usePriceOffer();
  const colors = useTheme();
  const [view, setView] = useState<'details' | 'bid'>('details');
  const [bids, setBids] = useState<BidEntry[]>([]);

  useEffect(() => {
    if (request) {
      if (initialView === 'bid') {
        setBids(getVacantSlots(request).map((s) => ({ ...s, selected: false, price: '' })));
        setView('bid');
      } else {
        setView('details');
        setBids([]);
      }
    }
  }, [request?.id, initialView]);

  if (!request) return null;

  function openBid() {
    setBids(getVacantSlots(request!).map((s) => ({ ...s, selected: false, price: '' })));
    setView('bid');
  }

  function toggleSelected(i: number) {
    setBids((prev) => prev.map((b, idx) => (idx === i ? { ...b, selected: !b.selected } : b)));
  }

  function setPrice(i: number, value: string) {
    setBids((prev) => prev.map((b, idx) => (idx === i ? { ...b, price: value } : b)));
  }

  const validBids = bids.filter((b) => b.selected && Number(b.price) > 0);
  const canSubmit = validBids.length > 0 && !isSubmitting;

  async function handleSubmit() {
    try {
      await submit(
        request!.id,
        validBids.map((b) => ({ category: b.category, subcategory: b.subcategory, price: Number(b.price) }))
      );
      setView('details');
      onApply();
    } catch {
      // error handled by usePriceOffer
    }
  }

  function handleClose() {
    setView('details');
    onClose();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleClose} />

        <View style={styles.card}>
          {/* Close button */}
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
            <X size={18} color={colors.textMuted} />
          </TouchableOpacity>

          {view === 'details' ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <Text style={styles.title}>{request.title}</Text>

              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Execution</Text>
                  <Text style={styles.metaValue}>{request.exec ?? (request as any).date ?? '—'}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Deadline</Text>
                  <Text style={styles.metaValue}>{request.deadline ?? '—'}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Location</Text>
                  <Text style={styles.metaValue}>{request.location}</Text>
                </View>
              </View>

              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Description</Text>
              <Text style={[styles.description, { color: colors.textSec }]}>{request.description}</Text>

              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Roles Needed</Text>
              {getVacantSlots(request).map((s, i) => (
                <View key={i} style={styles.slotRow}>
                  <Text style={styles.slotQty}>{s.quantity}×</Text>
                  <View>
                    <Text style={styles.slotSub}>{s.subcategory}</Text>
                    <Text style={[styles.slotCat, { color: colors.textMuted }]}>{s.category}</Text>
                  </View>
                </View>
              ))}

              <View style={styles.actions}>
                <TouchableOpacity style={styles.applyBtn} onPress={openBid} activeOpacity={0.8}>
                  <Text style={styles.applyText}>✦  Make an Offer</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} activeOpacity={0.8}>
                  <Text style={styles.dismissText}>✕  Not interested</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <>
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
                <TouchableOpacity onPress={() => setView('details')} style={styles.backBtn}>
                  <Text style={styles.backText}>← Back to Details</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Submit Your Offer</Text>
                <Text style={[styles.bidHint, { color: colors.textMuted }]}>Select the roles you want to fill and enter your price for each.</Text>

                {bids.map((b, i) => (
                  <View key={i} style={styles.bidRow}>
                    <Switch
                      value={b.selected}
                      onValueChange={() => toggleSelected(i)}
                      trackColor={{ true: '#004aad' }}
                    />
                    <View style={styles.bidInfo}>
                      <Text style={styles.bidSub}>{b.subcategory}</Text>
                      <Text style={[styles.bidCat, { color: colors.textMuted }]}>{b.category} · {b.quantity} needed</Text>
                    </View>
                    {b.selected && (
                      <TextInput
                        style={styles.priceInput}
                        value={b.price}
                        onChangeText={(v) => setPrice(i, v)}
                        placeholder="₪"
                        placeholderTextColor="#aaa"
                        keyboardType="numeric"
                        maxLength={8}
                      />
                    )}
                  </View>
                ))}
              </ScrollView>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.applyBtn, !canSubmit && styles.disabled]}
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                  activeOpacity={0.8}
                >
                  <Text style={styles.applyText}>
                    {isSubmitting ? 'Sending…' : `Submit Offer (${validBids.length} role${validBids.length === 1 ? '' : 's'})`}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
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
    maxHeight: '80%',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    borderWidth: 3,
    borderColor: '#cb6ce6',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  scrollContent: { paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: '#004aad', marginBottom: 16, paddingRight: 32 },
  metaRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  metaItem: { flex: 1, backgroundColor: 'rgba(0,74,173,0.06)', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(0,74,173,0.12)' },
  metaLabel: { fontSize: 11, fontWeight: '600', marginBottom: 2, textTransform: 'uppercase' },
  metaValue: { fontSize: 13, color: '#004aad', fontWeight: '600' },
  sectionLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  description: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(0,74,173,0.08)' },
  slotQty: { fontSize: 18, fontWeight: '800', color: '#cb6ce6', width: 32 },
  slotSub: { fontSize: 15, fontWeight: '600', color: '#004aad' },
  slotCat: { fontSize: 12, marginTop: 1 },
  actions: { marginTop: 20, gap: 10 },
  applyBtn: { backgroundColor: '#004aad', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  disabled: { opacity: 0.4 },
  applyText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dismissBtn: { borderWidth: 1.5, borderColor: '#e53935', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  dismissText: { color: '#e53935', fontSize: 15, fontWeight: '600' },
  backBtn: { marginBottom: 12 },
  backText: { fontSize: 14, color: '#cb6ce6', fontWeight: '600' },
  bidHint: { fontSize: 14, marginBottom: 16, lineHeight: 20 },
  bidRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,74,173,0.08)' },
  bidInfo: { flex: 1 },
  bidSub: { fontSize: 15, fontWeight: '600', color: '#004aad' },
  bidCat: { fontSize: 12, marginTop: 2 },
  priceInput: { width: 72, borderWidth: 1, borderColor: 'rgba(0,74,173,0.3)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, textAlign: 'center', color: '#004aad', backgroundColor: 'rgba(0,74,173,0.04)' },
});
