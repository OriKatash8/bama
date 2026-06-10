import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

type Details = {
  description: string;
  date: string;
  location: string;
  budget: number;
};

type Props = {
  onSubmit: (details: Details) => void;
  isSubmitting: boolean;
};

export function ProjectDetailsForm({ onSubmit, isSubmitting }: Props) {
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [budget, setBudget] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof Details, string>>>({});

  function validate(): boolean {
    const next: typeof errors = {};
    if (!description.trim()) next.description = 'Required';
    if (!date.trim()) next.date = 'Required';
    if (!location.trim()) next.location = 'Required';
    const b = Number(budget);
    if (!budget || isNaN(b) || b <= 0) next.budget = 'Enter a valid budget greater than 0';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    onSubmit({ description, date, location, budget: Number(budget) });
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
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
      {errors.description && <Text style={styles.error}>{errors.description}</Text>}

      <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.input}
        value={date}
        onChangeText={setDate}
        placeholder="2026-07-15"
      />
      {errors.date && <Text style={styles.error}>{errors.date}</Text>}

      <Text style={styles.label}>Location</Text>
      <TextInput
        style={styles.input}
        value={location}
        onChangeText={setLocation}
        placeholder="City, Country"
      />
      {errors.location && <Text style={styles.error}>{errors.location}</Text>}

      <Text style={styles.label}>Budget ($)</Text>
      <TextInput
        style={styles.input}
        value={budget}
        onChangeText={setBudget}
        placeholder="5000"
        keyboardType="numeric"
      />
      {errors.budget && <Text style={styles.error}>{errors.budget}</Text>}

      <TouchableOpacity
        style={[styles.button, isSubmitting && styles.disabled]}
        onPress={handleSubmit}
        disabled={isSubmitting}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>
          {isSubmitting ? 'Submitting…' : 'Submit Request'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
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
  button: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 16,
  },
  disabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
