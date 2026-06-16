import { memo, useMemo } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

type AvatarProps = {
  uri?: string | null;
  name?: string;
  size?: number;
};

export const Avatar = memo(function Avatar({ uri, name = '', size = 40 }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Stable object reference — only recreated when uri string actually changes.
  // Prevents React Native's Image from re-fetching when a parent re-renders
  // without changing the URI value.
  const source = useMemo(() => (uri ? { uri } : null), [uri]);

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      {source ? (
        <Image source={source} style={[styles.image, { borderRadius: size / 2 }]} />
      ) : (
        <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials}</Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  initials: { fontWeight: '600', color: '#555' },
});
