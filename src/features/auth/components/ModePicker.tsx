import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Platform } from 'react-native';
import { useSwitchMode } from '@features/auth/hooks/useSwitchMode';
import type { ActiveMode } from '@core/types/user';

function PersonIcon({ color = '#fff' }: { color?: string }) {
  return (
    <View style={personStyles.wrap}>
      <View style={[personStyles.head, { backgroundColor: color }]} />
      <View style={[personStyles.body, { backgroundColor: color }]} />
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
  const [pressed, setPressed] = useState<ActiveMode | null>(null);

  return (
    <View style={styles.container}>
      <Image
        source={require('../../../../assets/images/bama-logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      <View style={styles.buttons}>
        {CARDS.map(({ mode, title, color }) => {
          const isPressed = pressed === mode;
          return (
            <TouchableOpacity
              key={mode}
              style={[
                styles.btn,
                Platform.OS === 'web'
                  ? ({ background: isPressed ? 'linear-gradient(to right, #004aad, #cb6ce6)' : '#ffffff' } as any)
                  : { backgroundColor: isPressed ? color : '#ffffff' },
              ]}
              onPress={() => switchMode(mode)}
              onPressIn={() => setPressed(mode)}
              onPressOut={() => setPressed(null)}
              activeOpacity={1}
            >
              <Text style={[styles.btnText, { color: isPressed ? '#ffffff' : (mode === 'client' ? '#004aad' : '#cb6ce6') }]}>{title}</Text>
              {mode === 'client'
                ? <PersonIcon color={isPressed ? '#ffffff' : '#004aad'} />
                : <Text style={[styles.btnIcon, { color: isPressed ? '#ffffff' : '#cb6ce6' }]}>✦</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  logo: {
    width: '80%',
    height: 120,
    resizeMode: 'contain',
    alignSelf: 'center',
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
