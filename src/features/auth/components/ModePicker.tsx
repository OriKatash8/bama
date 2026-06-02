import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSwitchMode } from '@features/auth/hooks/useSwitchMode';
import type { ActiveMode } from '@core/types/user';

const CARDS: { mode: ActiveMode; title: string; subtitle: string }[] = [
  {
    mode: 'professional',
    title: "I'm a Professional",
    subtitle: 'Showcase your work and get hired.',
  },
  {
    mode: 'client',
    title: "I'm a Customer",
    subtitle: 'Discover and hire professionals for your projects.',
  },
];

export function ModePicker() {
  const { switchMode } = useSwitchMode();

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>How do you want to work today?</Text>
      <Text style={styles.subheading}>You can switch anytime from the app.</Text>

      {CARDS.map(({ mode, title, subtitle }) => (
        <TouchableOpacity
          key={mode}
          style={styles.card}
          onPress={() => switchMode(mode)}
          activeOpacity={0.7}
        >
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 16, paddingTop: 32 },
  heading: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  subheading: { fontSize: 14, color: '#666' },
  card: {
    borderRadius: 16,
    padding: 24,
    borderWidth: 1.5,
    borderColor: '#000',
    backgroundColor: '#fff',
  },
  cardTitle: { fontSize: 22, fontWeight: '700', color: '#000', marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: '#666' },
});
