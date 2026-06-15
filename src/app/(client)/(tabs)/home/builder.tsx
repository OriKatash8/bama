import { useState } from 'react';
import { ScrollView, StyleSheet, View, Text, TextInput, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@components/layout/Screen';
import { CategoryAccordion } from '@features/crew/components';
import { useCrewBuilder } from '@features/crew/hooks';
import { useProjectRequests } from '@features/crew/hooks';
import { useUiStore } from '@core/stores/uiStore';

export default function BuilderScreen() {
  const { slots, totalCount, addSlot, removeSlot } = useCrewBuilder();
  const { submit } = useProjectRequests();
  const { showToast } = useUiStore();

  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [budget, setBudget] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (totalCount === 0) next.slots = 'Select at least one role.';
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
      await submit(slots, { description, date, location, budget: Number(budget) });
      router.dismiss();
    } catch (e: any) {
      showToast(e.message ?? 'Failed to submit request', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen scrollable={false}>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Project Details</Text>

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe your project"
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
          />
          {errors.date ? <Text style={styles.error}>{errors.date}</Text> : null}

          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="City, Country"
          />
          {errors.location ? <Text style={styles.error}>{errors.location}</Text> : null}

          <Text style={styles.label}>Budget ($)</Text>
          <TextInput
            style={styles.input}
            value={budget}
            onChangeText={setBudget}
            placeholder="5000"
            keyboardType="numeric"
          />
          {errors.budget ? <Text style={styles.error}>{errors.budget}</Text> : null}
        </View>

        <Text style={styles.sectionTitle2}>Select Roles</Text>
        <CategoryAccordion
          slots={slots}
          onSelectSubcategory={addSlot}
          onRemoveSubcategory={removeSlot}
        />
        {errors.slots ? <Text style={[styles.error, styles.slotsError]}>{errors.slots}</Text> : null}

        <View style={styles.submitWrap}>
          <TouchableOpacity
            style={[styles.submitBtn, isSubmitting && styles.disabled]}
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
  section: { padding: 16, paddingTop: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 8 },
  sectionTitle2: { fontSize: 18, fontWeight: '700', color: '#111', paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8 },
  slotsError: { paddingHorizontal: 16 },
  submitWrap: { padding: 16, paddingBottom: 32 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 16, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  multiline: { height: 100 },
  error: { fontSize: 12, color: '#e53e3e', marginTop: 4 },
  submitBtn: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 24,
  },
  disabled: { backgroundColor: '#ccc' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
