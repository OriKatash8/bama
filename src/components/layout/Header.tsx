import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

type HeaderProps = {
  title: string;
  showBack?: boolean;
};

export function Header({ title, showBack = false }: HeaderProps) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      {showBack && (
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  back: { marginRight: 12 },
  backText: { fontSize: 20 },
  title: { fontSize: 18, fontWeight: '700', color: '#000' },
});
