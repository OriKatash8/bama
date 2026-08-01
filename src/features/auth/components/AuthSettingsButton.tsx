import { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TouchableWithoutFeedback, StyleSheet,
} from 'react-native';
import { Settings, Sun, Moon } from 'lucide-react-native';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useUiStore } from '@core/stores/uiStore';
import type { Lang } from '@core/stores/settingsStore';

export function AuthSettingsButton() {
  const [open, setOpen] = useState(false);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const isDark = useUiStore((s) => s.isDark);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Settings size={18} color="#004aad" />
      </TouchableOpacity>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={styles.backdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.card}>

                {/* Language row */}
                <Text style={styles.rowLabel}>שפה / Language</Text>
                <View style={styles.pillRow}>
                  {(['he', 'en'] as Lang[]).map((lang) => (
                    <TouchableOpacity
                      key={lang}
                      style={[styles.pill, language === lang && styles.pillActive]}
                      onPress={() => { setLanguage(lang); setOpen(false); }}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.pillText, language === lang && styles.pillTextActive]}>
                        {lang === 'he' ? 'עברית' : 'EN'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Appearance row */}
                <Text style={styles.rowLabel}>מראה / Appearance</Text>
                <View style={styles.pillRow}>
                  <TouchableOpacity
                    style={[styles.pill, !isDark && styles.pillActive]}
                    onPress={() => { if (isDark) toggleTheme(); setOpen(false); }}
                    activeOpacity={0.8}
                  >
                    <Sun size={15} color={!isDark ? '#fff' : '#004aad'} />
                    <Text style={[styles.pillText, !isDark && styles.pillTextActive]}>בהיר</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pill, isDark && styles.pillActive]}
                    onPress={() => { if (!isDark) toggleTheme(); setOpen(false); }}
                    activeOpacity={0.8}
                  >
                    <Moon size={15} color={isDark ? '#fff' : '#004aad'} />
                    <Text style={[styles.pillText, isDark && styles.pillTextActive]}>כהה</Text>
                  </TouchableOpacity>
                </View>

              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    position: 'absolute',
    top: 12,
    right: 16,
    zIndex: 10,
    padding: 6,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: 240,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#004aad',
  },
  pillActive: {
    backgroundColor: '#004aad',
    borderColor: '#004aad',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#004aad',
  },
  pillTextActive: {
    color: '#fff',
  },
});
