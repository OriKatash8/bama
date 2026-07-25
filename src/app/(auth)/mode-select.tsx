import { useEffect } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Settings } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { ModePicker } from '@features/auth/components/ModePicker';
import { useIsAdmin } from '@core/hooks/useIsAdmin';
import { auth } from '@core/firebase/config';

export default function ModeSelectScreen() {
  const { isAdmin, loading } = useIsAdmin();
  const router = useRouter();

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) { console.log('[admin debug] no user'); return; }
    user.getIdTokenResult(true).then(result => {
      console.log('[admin debug] uid:', user.uid);
      console.log('[admin debug] claims:', JSON.stringify(result.claims));
      console.log('[admin debug] role:', result.claims['role']);
    });
  }, []);

  console.log('[ModeSelect] isAdmin:', isAdmin, 'loading:', loading, 'will render button:', isAdmin && !loading);

  return (
    <Screen scrollable={false}>
      <ModePicker />
      {isAdmin && (
        <TouchableOpacity
          style={styles.adminBtn}
          onPress={() => router.push('/admin')}
        >
          <Settings size={18} color="#fff" />
        </TouchableOpacity>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  adminBtn: {
    position: 'absolute',
    bottom: 40,
    right: 20,
    zIndex: 9999,
    backgroundColor: 'red',
    width: 50,
    height: 50,
    borderRadius: 25,
    opacity: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
