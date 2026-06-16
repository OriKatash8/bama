import { View, Text, Image, StyleSheet } from 'react-native';

type AvatarProps = {
  uri?: string | null;
  name?: string;
  size?: number;
};

export function Avatar({ uri, name = '', size = 40 }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      {uri ? (
        <Image source={{ uri }} style={[styles.image, { borderRadius: size / 2 }]} />
      ) : (
        <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  initials: { fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
});
