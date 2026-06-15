import { useState } from 'react';
import { ScrollView, StyleSheet, View, Text, TextInput, TouchableOpacity, Platform } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@components/layout/Screen';
import { CategoryAccordion } from '@features/crew/components';
import { useCrewBuilder, useProjectRequests, useAiCrewRecommendation } from '@features/crew/hooks';
import { useUiStore } from '@core/stores/uiStore';

const gradientStyle = {
  background: 'linear-gradient(to right, #004aad, #cb6ce6)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
} as any;

export default function BuilderScreen() {
  const { slots, totalCount, addSlot, removeSlot } = useCrewBuilder();
  const { submit } = useProjectRequests();
  const { showToast } = useUiStore();
  const { recommend, result: aiResult, isLoading: aiLoading, error: aiError, clear: clearAi } = useAiCrewRecommendation();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [budget, setBudget] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (totalCount === 0) next.slots = 'Select at least one role.';
    if (!title.trim()) next.title = 'Required';
    if (!description.trim()) next.description = 'Required';
    if (!date.trim()) next.date = 'Required';
    if (!location.trim()) next.location = 'Required';
    const b = Number(budget);
    if (!budget || isNaN(b) || b <= 0) next.budget = 'Enter a valid budget greater than 0';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await submit(slots, { title, description, date, location, budget: Number(budget) });
      router.dismiss();
    } catch (e: any) {
      showToast(e.message ?? 'Failed to submit request', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen scrollable={false} backgroundColor="#0f0f1f">
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, Platform.OS === 'web' && ({ boxShadow: '0 0 40px #7b4fd466, 0 0 80px #004aad33' } as any)]}>
          <Text style={[styles.sectionTitle, Platform.OS === 'web' && gradientStyle]}>Project Details</Text>

          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Music video for new single"
            placeholderTextColor="#666"
          />
          {errors.title ? <Text style={styles.error}>{errors.title}</Text> : null}

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe your project"
            placeholderTextColor="#666"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          {errors.description ? <Text style={styles.error}>{errors.description}</Text> : null}

          <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="2026-07-15"
            placeholderTextColor="#666"
          />
          {errors.date ? <Text style={styles.error}>{errors.date}</Text> : null}

          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="City, Country"
            placeholderTextColor="#666"
          />
          {errors.location ? <Text style={styles.error}>{errors.location}</Text> : null}

          <Text style={styles.label}>Budget ($)</Text>
          <TextInput
            style={styles.input}
            value={budget}
            onChangeText={setBudget}
            placeholder="5000"
            placeholderTextColor="#666"
            keyboardType="numeric"
          />
          {errors.budget ? <Text style={styles.error}>{errors.budget}</Text> : null}
        </View>

        <View style={styles.aiWrap}>
          <TouchableOpacity
            style={[styles.aiBtn, Platform.OS === 'web' && ({ background: 'linear-gradient(to right, #004aad, #cb6ce6)' } as any), aiLoading && styles.disabled]}
            onPress={() => recommend({ title, description, date, location, budget })}
            disabled={aiLoading}
            activeOpacity={0.8}
          >
            <Text style={styles.aiBtnText}>{aiLoading ? 'Thinking…' : '✦ AI Suggest Roles'}</Text>
          </TouchableOpacity>

          {aiError ? <Text style={styles.error}>{aiError}</Text> : null}

          {aiResult ? (
            <View style={styles.aiCard}>
              <Text style={styles.aiExplanation}>{aiResult.explanation}</Text>
              <View style={styles.aiSlots}>
                {aiResult.slots.map((s, i) => (
                  <View key={i} style={styles.aiSlotRow}>
                    <Text style={styles.aiSlotText}>
                      {s.quantity}× {s.subcategory}
                      <Text style={styles.aiSlotCat}> ({s.category})</Text>
                    </Text>
                  </View>
                ))}
              </View>
              <View style={styles.aiActions}>
                <TouchableOpacity
                  style={[styles.applyBtn, Platform.OS === 'web' && ({ background: 'linear-gradient(to right, #004aad, #cb6ce6)' } as any)]}
                  onPress={() => {
                    aiResult.slots.forEach((s) => {
                      for (let i = 0; i < s.quantity; i++) addSlot(s.category, s.subcategory);
                    });
                    clearAi();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.applyBtnText}>Apply Suggestions</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={clearAi} style={styles.dismissBtn}>
                  <Text style={styles.dismissText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.rolesWrap}>
          <Text style={[styles.sectionTitle, Platform.OS === 'web' && gradientStyle]}>Select Roles</Text>
          <View style={[styles.rolesCard, Platform.OS === 'web' && ({ boxShadow: '0 0 40px #7b4fd466, 0 0 80px #004aad33' } as any)]}>
            <CategoryAccordion
              slots={slots}
              onSelectSubcategory={addSlot}
              onRemoveSubcategory={removeSlot}
            />
          </View>
          {errors.slots ? <Text style={styles.error}>{errors.slots}</Text> : null}
        </View>

        <View style={styles.submitWrap}>
          <TouchableOpacity
            style={[
              styles.submitBtn,
              isSubmitting && styles.disabled,
              Platform.OS === 'web' && !isSubmitting && ({ background: 'linear-gradient(to right, #004aad, #cb6ce6)' } as any),
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            <Text style={styles.submitText}>
              {isSubmitting ? 'Submitting…' : `Submit Request${totalCount > 0 ? ` (${totalCount} role${totalCount === 1 ? '' : 's'})` : ''}`}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  card: {
    margin: 16,
    marginTop: 24,
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ffffff18',
  },
  rolesWrap: { marginHorizontal: 16, marginTop: 24 },
  rolesCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ffffff18',
    marginTop: 8,
  },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  label: { fontSize: 14, fontWeight: '600', color: '#ccc', marginTop: 16, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#ffffff44',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    backgroundColor: '#0f0f1f',
    color: '#fff',
  },
  multiline: { height: 100 },
  error: { fontSize: 12, color: '#fc8181', marginTop: 4 },
  aiWrap: { marginHorizontal: 16, marginTop: 20 },
  aiBtn: {
    backgroundColor: '#004aad',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  aiBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  aiCard: {
    marginTop: 12,
    backgroundColor: '#12122a',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffffff22',
  },
  aiExplanation: { color: '#ccc', fontSize: 14, lineHeight: 20, marginBottom: 12 },
  aiSlots: { gap: 6, marginBottom: 16 },
  aiSlotRow: { flexDirection: 'row', alignItems: 'center' },
  aiSlotText: { color: '#e0e0e0', fontSize: 14, fontWeight: '600' },
  aiSlotCat: { color: '#888', fontWeight: '400' },
  aiActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  applyBtn: {
    flex: 1,
    backgroundColor: '#004aad',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  applyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  dismissBtn: { paddingVertical: 11, paddingHorizontal: 8 },
  dismissText: { color: '#888', fontSize: 14 },
  submitWrap: { padding: 16, paddingBottom: 32 },
  submitBtn: {
    backgroundColor: '#004aad',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  disabled: { backgroundColor: '#555' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
