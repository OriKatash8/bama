import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useSwitchMode } from '@features/auth/hooks/useSwitchMode';
import type { ActiveMode } from '@core/types/user';

function PersonIcon() {
  return (
    <View style={personStyles.wrap}>
      <View style={personStyles.head} />
      <View style={personStyles.body} />
    </View>
  );
}

const personStyles = StyleSheet.create({
  wrap:  { width: 22, height: 22, alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  head:  { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  body:  { width: 16, height: 10, borderRadius: 4, backgroundColor: '#fff' },
});

const CARDS: { mode: ActiveMode; title: string; color: string }[] = [
  { mode: 'client',       title: "I'm a Customer",     color: '#004aad' },
  { mode: 'professional', title: "I'm a Professional", color: '#cb6ce6' },
];

export function ModePicker() {
  const { switchMode } = useSwitchMode();

  return (
    <View style={styles.container}>
      <Image
        source={require('../../../../assets/images/bama-logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      <View style={styles.buttons}>
        {CARDS.map(({ mode, title, color }) => (
          <TouchableOpacity
            key={mode}
            style={[styles.btn, { backgroundColor: color }]}
            onPress={() => switchMode(mode)}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>{title}</Text>
            {mode === 'client' ? <PersonIcon /> : <Text style={styles.btnIcon}>✦</Text>}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 32,
    paddingHorizontal: 32,
    paddingTop: 16,
    paddingBottom: 40,
  },
  logo: {
    width: '100%',
    height: 540,
  },
  buttons: {
    width: '100%',
    gap: 16,
  },
  btn: {
    borderRadius: 16,
    paddingVertical: 26,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 72,
  },
  btnText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  btnIcon: {
    color: '#ffffff',
    fontSize: 22,
  },
});
