import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpen, MessagesSquare, ShoppingBag, ChevronRight, ChevronLeft } from 'lucide-react-native';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

const HEADER_PURPLE = '#cb6ce6';

export default function OperationsAdmin() {
  const colors = useTheme();
  const font = useAppFont();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  const t = makeT(rtl ? he : en);
  const rowDir = rtl ? 'row-reverse' : 'row';
  const textAlign = rtl ? 'right' : 'left';
  const Chevron = rtl ? ChevronLeft : ChevronRight;

  const items: { label: string; route: '/admin/courses' | '/admin/communities' | '/admin/marketplace'; icon: typeof BookOpen }[] = [
    { label: t('admin_operations.courses'), route: '/admin/courses', icon: BookOpen },
    { label: t('admin_operations.communities'), route: '/admin/communities', icon: MessagesSquare },
    { label: t('admin_operations.marketplace'), route: '/admin/marketplace', icon: ShoppingBag },
  ];

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      {/* Header — flat solid purple, title on the right */}
      <View style={[styles.header, { backgroundColor: HEADER_PURPLE, paddingTop: insets.top + 14, alignItems: 'flex-end' }]}>
        <Text style={[styles.greeting, { ...font.regular, textAlign: 'right' }]}>{t('admin_operations.greeting')}</Text>
        <Text style={[styles.headerTitle, { ...font.medium, textAlign: 'right' }]}>{t('admin_operations.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {items.map(({ label, route, icon: Icon }, i) => (
            <TouchableOpacity
              key={route}
              style={[styles.row, { flexDirection: rowDir }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
              onPress={() => router.push(route)}
              activeOpacity={0.7}
            >
              <View style={[styles.icon, { backgroundColor: colors.primary + '18' }]}>
                <Icon size={18} color={colors.primary} strokeWidth={2.2} />
              </View>
              <Text style={[styles.label, { ...font.medium, color: colors.text, textAlign }]}>{label}</Text>
              <Chevron size={20} color={colors.textMuted} strokeWidth={2} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingBottom: 14, paddingHorizontal: 16, gap: 2 },
  greeting: { fontSize: 11, color: 'rgba(255,255,255,0.7)', width: '100%' },
  headerTitle: { fontSize: 17, color: '#ffffff', width: '100%' },

  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  row: { alignItems: 'center', gap: 14, minHeight: 56, paddingHorizontal: 16, paddingVertical: 14 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 16 },
});
