import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSetRole } from '@features/auth/hooks/useSetRole';
import type { UserRole } from '@core/types/user';

const CARDS: { role: UserRole; title: string; subtitle: string }[] = [
  {
    role: 'customer',
    title: "I'm a Customer",
    subtitle: 'Discover and hire professionals for your projects.',
  },
  {
    role: 'professional',
    title: "I'm a Professional",
    subtitle: 'Showcase your work and get hired.',
  },
];

export function RolePicker() {
  const { isLoading, error, selectRole } = useSetRole();

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Choose your role</Text>
      <Text style={styles.subheading}>You can always update this later.</Text>

      {CARDS.map(({ role, title, subtitle }) => (
        <TouchableOpacity
          key={role}
          style={[styles.card, isLoading && styles.cardDisabled]}
          onPress={() => selectRole(role)}
          disabled={isLoading}
          activeOpacity={0.7}
        >
          {isLoading ? (
            <ActivityIndicator color="#000" style={styles.indicator} />
          ) : null}
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        </TouchableOpacity>
      ))}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 16,
    paddingTop: 32,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subheading: {
    fontSize: 14,
    color: '#666',
  },
  card: {
    borderRadius: 16,
    padding: 24,
    borderWidth: 1.5,
    borderColor: '#000',
    backgroundColor: '#fff',
  },
  cardDisabled: {
    opacity: 0.4,
  },
  indicator: {
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  error: {
    color: 'red',
    fontSize: 14,
    textAlign: 'center',
  },
});
