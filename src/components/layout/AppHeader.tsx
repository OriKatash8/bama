import { Children, Fragment, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useModeAccent } from '@core/navigation/floatingTabBar';

const BAMA_LOGO = require('../../../assets/images/bama-logo-2.png');
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Bell, Camera, ChevronDown, ChevronLeft, ChevronRight, FileText, Globe, Info, LogOut, MessageCircle, Percent, Phone, Receipt, Settings, Shield, User, Wallet, X, Trash2 } from 'lucide-react-native';
import { useAuthStore } from '@core/stores/authStore';
import { useSettingsStore, type Lang } from '@core/stores/settingsStore';
import { useUiStore } from '@core/stores/uiStore';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useLogout } from '@features/auth/hooks/useLogout';
import { uploadFile } from '@core/firebase/storage';
import { updateDocument } from '@core/firebase/firestore';
import { AppText } from '@components/ui/AppText';
import { ModeSwitcherSheet } from '@features/auth/components/ModeSwitcherSheet';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { shrinkAvatar } from '@features/profile/utils/shrinkAvatar';
import { legalUrl } from '@core/constants/legal';
import Constants from 'expo-constants';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

function getGreetingKey(): string {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) return 'noticeboard.greeting_morning';
  if (hour >= 12 && hour < 18) return 'noticeboard.greeting_afternoon';
  if (hour >= 18 && hour < 22) return 'noticeboard.greeting_evening';
  return 'noticeboard.greeting_night';
}

export function AppHeader() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const activeMode = useAuthStore((s) => s.activeMode);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const isDark = useUiStore((s) => s.isDark);
  const colors = useTheme();
  const font = useAppFont();
  const { logout } = useLogout();
  const router = useRouter();
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  // The app forces LTR globally (src/app/_layout.tsx), so the drawer flips itself
  // for Hebrew the way every screen does: rows reverse, text aligns to the start,
  // and the chevron points forward — left in Hebrew, right in English.
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const align = rtl ? ('right' as const) : ('left' as const);
  const Forward = rtl ? ChevronLeft : ChevronRight;

  const [modeSheetVisible, setModeSheetVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  // "Information" in the settings menu: closed until tapped.
  const [infoOpen, setInfoOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const slideAnim = useRef(new Animated.Value(280)).current;

  useEffect(() => {
    if (settingsVisible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 240,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(280);
    }
  }, [settingsVisible]);

  const firstName = user?.displayName?.split(' ')[0] ?? '';
  const greeting = `${t(getGreetingKey())}, ${firstName}`;
  const modeIsClient = activeMode === 'client';
  // The settings panel's buttons (and the mode badge) follow the mode.
  const { accent } = useModeAccent();
  const cardBg = isDark ? colors.card : '#FFFFFF';
  const appVersion = Constants.expoConfig?.version ?? '';

  /** Close the drawer, then open a settings screen. */
  function go(path: string) {
    setSettingsVisible(false);
    router.push(path as never);
  }

  /** A navigation row: icon at the start, label, chevron at the end. */
  function menuRow(id: string, Icon: typeof Bell, label: string, onPress: () => void) {
    return (
      <TouchableOpacity
        key={id}
        testID={`settings-row-${id}`}
        style={[styles.menuRow, { flexDirection: rowDir }]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <Icon size={18} color={colors.textMuted} strokeWidth={1.5} />
        <AppText weight="regular" style={[styles.menuLabel, { color: colors.text, textAlign: align }]}>
          {label}
        </AppText>
        <Forward size={16} color={colors.textMuted} strokeWidth={1.5} />
      </TouchableOpacity>
    );
  }

  /** A small gray section title over a rounded card; rows inside are divided by hairlines. */
  function sectionTitle(title: string, id: string, rows: ReactNode) {
    const items = flattenRows(rows);
    return (
      <View testID={`settings-card-${id}`} style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted, textAlign: align, ...font.semiBold }]}>
          {title}
        </Text>
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          {items.map((row, i) => (
            <Fragment key={i}>
              {i > 0 && <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />}
              {row}
            </Fragment>
          ))}
        </View>
      </View>
    );
  }
  const modeBadgeColor = accent;
  const modeBadgeLabel = modeIsClient ? t('header.client_mode') : t('header.pro_mode');

  async function handleAvatarPress() {
    if (!user) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as const,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled) return;

    setAvatarUploading(true);
    try {
      const blob = await fetch(await shrinkAvatar(result.assets[0].uri)).then((r) => r.blob());
      const path = `users/${user.id}/avatar/${Date.now()}.jpg`;
      const photoURL = await uploadFile(path, blob);
      await updateDocument(`users/${user.id}`, { photoURL });
      setUser({ ...user, photoURL });
    } catch {
      Alert.alert('Upload failed', 'Could not update your photo. Please try again.');
    } finally {
      setAvatarUploading(false);
    }
  }

  return (
    <>
      {/* ── Top bar ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8, paddingBottom: 10 }]}>
        {/* LEFT — logo, wrapped so both sides share equal flex */}
        <View style={styles.leftGroup}>
          <Image source={BAMA_LOGO} style={styles.logo} contentFit="contain" cachePolicy="memory-disk" />
        </View>

        {/* CENTER — greeting */}
        <View style={styles.center}>
          <AppText
            weight="regular"
            style={[styles.greeting, { color: colors.text }]}
            numberOfLines={1}
          >
            {greeting}
          </AppText>
        </View>

        {/* RIGHT — settings + mode badge */}
        <View style={styles.rightGroup}>
          <TouchableOpacity
            style={styles.gearBtn}
            onPress={() => setSettingsVisible(true)}
            testID="settings-gear"
            accessibilityRole="button"
            activeOpacity={0.7}
          >
            <Settings size={22} color={colors.text} strokeWidth={1.5} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBadge, { backgroundColor: modeBadgeColor }]}
            onPress={() => setModeSheetVisible(true)}
            activeOpacity={0.8}
          >
            <AppText weight="semiBold" style={styles.modeBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {modeBadgeLabel}
            </AppText>
          </TouchableOpacity>
        </View>
      </View>

      <ModeSwitcherSheet visible={modeSheetVisible} onClose={() => setModeSheetVisible(false)} />

      {/* ── Settings panel ── */}
      <Modal
        visible={settingsVisible}
        transparent
        animationType="none"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setSettingsVisible(false)}
        />
        <Animated.View
          style={[
            styles.panel,
            { backgroundColor: isDark ? colors.card : '#ffffff', transform: [{ translateX: slideAnim }] },
          ]}
        >
          {/* Close row */}
          <View style={[styles.panelTopBar, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setSettingsVisible(false)} activeOpacity={0.7} style={styles.closeBtn}>
              <X size={20} color={colors.text} strokeWidth={1.5} />
            </TouchableOpacity>
          </View>

          {/* Everything under the close bar scrolls: on a short screen the rows
              at the bottom (log out, contact us) were cut off. */}
          <ScrollView
            testID="settings-scroll"
            style={styles.panelScroll}
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Profile — one compact row: the avatar (tap = change photo, camera
                badge), name and email. A professional also gets "edit profile",
                to the profile editor; a client has no profile screen, so for
                them the row is static, with no chevron. */}
            <View style={[styles.profileRow, { flexDirection: rowDir }]}>
              <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.8} style={styles.avatarWrap}>
                <View testID="settings-avatar" style={[styles.avatar, { backgroundColor: accent }]}>
                  {user?.photoURL ? (
                    <Image source={{ uri: user.photoURL }} style={styles.avatarImg} contentFit="cover" cachePolicy="memory-disk" />
                  ) : (
                    <User size={22} color="#fff" strokeWidth={1.5} />
                  )}
                  {avatarUploading && (
                    <View style={styles.avatarOverlay}>
                      <ActivityIndicator size="small" color="#ffffff" />
                    </View>
                  )}
                </View>
                <View testID="settings-camera-badge" style={[styles.cameraBadge, rtl ? { left: 0 } : { right: 0 }, { backgroundColor: accent }]}>
                  <Camera size={10} color="#fff" strokeWidth={2} />
                </View>
              </TouchableOpacity>
              {modeIsClient ? (
                <View style={styles.profileText}>
                  <AppText weight="bold" style={[styles.userName, { color: colors.text, textAlign: align }]} numberOfLines={1}>
                    {user?.displayName ?? ''}
                  </AppText>
                  <Text style={[styles.userEmail, { color: colors.textMuted, textAlign: align, ...font.regular }]} numberOfLines={1}>
                    {user?.email ?? ''}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.profileText, styles.profileLinkArea, { flexDirection: rowDir }]}
                  onPress={() => { setSettingsVisible(false); router.push('/(professional)/(tabs)/profile?edit=1'); }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                >
                  <View style={styles.profileTextCol}>
                    <AppText weight="bold" style={[styles.userName, { color: colors.text, textAlign: align }]} numberOfLines={1}>
                      {user?.displayName ?? ''}
                    </AppText>
                    <Text style={[styles.userEmail, { color: colors.textMuted, textAlign: align, ...font.regular }]} numberOfLines={1}>
                      {user?.email ?? ''}
                    </Text>
                    <AppText weight="semiBold" style={[styles.editProfile, { color: accent, textAlign: align }]}>
                      {t('settings.edit_profile')}
                    </AppText>
                  </View>
                  <View testID="settings-profile-chevron">
                    <Forward size={16} color={colors.textMuted} strokeWidth={1.5} />
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* ── Preferences ── */}
            {sectionTitle(t('settings.section_preferences'), 'preferences', (
              <>
                {/* Language: the עב/EN toggle stays at the end of the row. */}
                <View testID="settings-row-language" style={[styles.menuRow, { flexDirection: rowDir }]}>
                  <Globe size={18} color={colors.textMuted} strokeWidth={1.5} />
                  <AppText weight="regular" style={[styles.menuLabel, { color: colors.text, textAlign: align }]}>
                    {t('settings.language')}
                  </AppText>
                  <View style={[styles.langToggle, { borderColor: colors.border }]}>
                    {(['he', 'en'] as Lang[]).map((lang) => {
                      const active = language === lang;
                      return (
                        <TouchableOpacity
                          key={lang}
                          style={[styles.langBtn, active && { backgroundColor: accent }]}
                          onPress={() => setLanguage(lang)}
                          activeOpacity={0.8}
                        >
                          <AppText weight="semiBold" style={[styles.langBtnText, { color: active ? '#fff' : colors.textMuted }]}>
                            {lang === 'he' ? 'עב' : 'EN'}
                          </AppText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                {menuRow('notifications', Bell, t('settings.notifications'), () => go('/settings/notifications'))}
              </>
            ))}

            {/* ── Account & billing ── Pricing and the balance are for
                professionals only: a client is never charged a commission. */}
            {sectionTitle(t('settings.section_account'), 'account', (
              <>
                {/* Phone number — both modes. Private; the gate asks for it once,
                    this is where it is changed. */}
                {menuRow('phone', Phone, t('settings.phone'), () => go('/settings/phone'))}
                {!modeIsClient && menuRow('pricing', Percent, t('settings.pricing'), () => go('/settings/pricing'))}
                {!modeIsClient && menuRow('balance', Wallet, t('balance.title'), () => go('/settings/payment'))}
              </>
            ))}

            {/* ── Help & info ── */}
            {sectionTitle(t('settings.section_help'), 'help', (
              <>
                {menuRow('contact', MessageCircle, t('settings.contact_us'), () => go('/settings/contact'))}
                {/* Information — opens in place to the three policies: privacy
                    (Apple requires it reachable inside the app), terms, and
                    cancellation & refunds. Each opens in the app's language. */}
                <TouchableOpacity
                  testID="settings-row-information"
                  style={[styles.menuRow, { flexDirection: rowDir }]}
                  onPress={() => setInfoOpen((o) => !o)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: infoOpen }}
                >
                  <Info size={18} color={colors.textMuted} strokeWidth={1.5} />
                  <AppText weight="regular" style={[styles.menuLabel, { color: colors.text, textAlign: align }]}>
                    {t('settings.information')}
                  </AppText>
                  {infoOpen
                    ? <ChevronDown size={16} color={colors.textMuted} strokeWidth={1.5} />
                    : <Forward size={16} color={colors.textMuted} strokeWidth={1.5} />}
                </TouchableOpacity>
                {infoOpen && ([
                  { key: 'privacy', Icon: Shield, label: t('settings.privacy') },
                  { key: 'terms', Icon: FileText, label: t('settings.terms') },
                  { key: 'refunds', Icon: Receipt, label: t('settings.refunds') },
                ] as const).map(({ key, Icon, label }) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.menuRow, styles.subMenuRow, rtl ? { paddingEnd: 26 } : { paddingStart: 26 }, { flexDirection: rowDir, borderTopColor: colors.border }]}
                    onPress={() => void Linking.openURL(legalUrl(key, language))}
                    activeOpacity={0.7}
                  >
                    <Icon size={16} color={colors.textMuted} strokeWidth={1.5} />
                    <AppText weight="regular" style={[styles.menuLabel, { color: colors.text, textAlign: align }]}>
                      {label}
                    </AppText>
                    <Forward size={16} color={colors.textMuted} strokeWidth={1.5} />
                  </TouchableOpacity>
                ))}
              </>
            ))}

            {/* Log out — its own card, red. */}
            <View testID="settings-logout-card" style={[styles.card, { backgroundColor: cardBg }]}>
              <TouchableOpacity
                style={[styles.menuRow, { flexDirection: rowDir }]}
                onPress={() => { setSettingsVisible(false); logout(); }}
                activeOpacity={0.7}
              >
                <LogOut size={18} color={DANGER} strokeWidth={1.5} />
                <AppText weight="semiBold" style={[styles.menuLabel, styles.logoutText, { textAlign: align }]}>
                  {t('settings.logout')}
                </AppText>
              </TouchableOpacity>
            </View>

            {/* Footer: the app version, and delete account as a small link. Apple
                5.1.1(v) requires delete account to exist IN THE APP; the link only
                opens the screen that explains the consequences and confirms —
                it deletes nothing itself. */}
            <View testID="settings-footer" style={[styles.footer, { flexDirection: rowDir }]}>
              <Text style={[styles.footerText, { color: colors.textMuted, ...font.regular }]}>
                {`${t('settings.version')} ${appVersion}`}
              </Text>
              <Text style={[styles.footerText, { color: colors.textMuted, ...font.regular }]}>·</Text>
              <Text
                style={[styles.footerText, styles.footerLink, { color: colors.textMuted, ...font.regular }]}
                onPress={() => go('/settings/delete-account')}
                accessibilityRole="link"
              >
                {t('settings.delete_account')}
              </Text>
            </View>
          </ScrollView>
        </Animated.View>
      </Modal>
    </>
  );
}

/** The rows of a card, with fragments opened up and nothing (false/null) dropped. */
function flattenRows(node: ReactNode): ReactNode[] {
  return Children.toArray(node).flatMap((c) =>
    isValidElement<{ children?: ReactNode }>(c) && c.type === Fragment ? flattenRows(c.props.children) : [c],
  );
}

const DANGER = '#ff4d6d';

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  logo: { width: 72, height: 72, marginVertical: -20 },
  leftGroup: { flex: 1 },
  center: { flex: 2, alignItems: 'center' },
  greeting: { fontSize: 13, textAlign: 'center' },
  rightGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  modeBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  modeBadgeText: { fontSize: 11, color: '#ffffff' },
  gearBtn: { padding: 4 },

  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 280,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  panelTopBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: { padding: 4 },
  panelScroll: { flex: 1 },

  profileRow: { alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  profileText: { flex: 1 },
  profileLinkArea: { alignItems: 'center', gap: 8 },
  profileTextCol: { flex: 1 },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 52, height: 52 },
  avatarOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // lineHeight ≥ 1.47× fontSize throughout: Heebo clips glyph tops below that on iOS.
  userName: { fontSize: 15, lineHeight: 22 },
  userEmail: { fontSize: 12, lineHeight: 18 },
  editProfile: { fontSize: 13, lineHeight: 20, marginTop: 2 },

  section: { paddingHorizontal: 12, marginTop: 14 },
  sectionTitle: { fontSize: 12, lineHeight: 18, paddingHorizontal: 6, marginBottom: 6 },
  card: { borderRadius: 14, overflow: 'hidden', marginHorizontal: 0 },
  rowDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  menuRow: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  menuLabel: { flex: 1, fontSize: 14, lineHeight: 21 },
  // A policy row inside "Information": indented under it (start side set inline).
  subMenuRow: { paddingVertical: 11 },

  langToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 2,
    gap: 2,
  },
  langBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langBtnText: { fontSize: 12 },

  logoutText: { color: DANGER },

  footer: { justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 18, paddingHorizontal: 16 },
  footerText: { fontSize: 12, lineHeight: 18 },
  footerLink: { textDecorationLine: 'underline' },
});
