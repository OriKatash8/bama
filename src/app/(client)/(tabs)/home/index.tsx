import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { Screen } from '@components/layout/Screen';
import { ProjectRequestCard } from '@features/crew/components';
import { useProjectRequests, useAiCrewSuggestion } from '@features/crew/hooks';

export default function HomeScreen() {
  const { requests, isLoading } = useProjectRequests();
  const { suggest, suggestion, isLoading: aiLoading, error: aiError } = useAiCrewSuggestion();
  const [description, setDescription] = useState('');

  const apiKeyPresent = !!process.env.EXPO_PUBLIC_CLAUDE_API_KEY;

  return (
    <Screen scrollable={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Build Your Crew</Text>
            <Text style={styles.heroSubtitle}>
              Describe your project for AI crew suggestions
            </Text>

            {apiKeyPresent && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="E.g. I'm shooting a wedding in Dubai for 200 guests…"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  multiline
                  numberOfLines={3}
                  value={description}
                  onChangeText={setDescription}
                />
                {description.trim().length > 0 && (
                  <TouchableOpacity
                    style={[styles.suggestBtn, aiLoading && styles.btnDisabled]}
                    onPress={() => suggest(description.trim())}
                    disabled={aiLoading}
                    activeOpacity={0.8}
                  >
                    {aiLoading ? (
                      <ActivityIndicator color="#111" size="small" />
                    ) : (
                      <Text style={styles.suggestBtnText}>Get Suggestions</Text>
                    )}
                  </TouchableOpacity>
                )}
                {aiError != null && (
                  <Text style={styles.aiError}>{aiError}</Text>
                )}
                {suggestion != null && (
                  <Text style={styles.suggestion}>{suggestion}</Text>
                )}
              </>
            )}

            <TouchableOpacity
              style={styles.buildBtn}
              onPress={() => router.push('/(client)/(tabs)/home/builder')}
              activeOpacity={0.8}
            >
              <Text style={styles.buildBtnText}>Start Building →</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.projectsSection}>
            <Text style={styles.sectionTitle}>My Projects</Text>
            {isLoading ? (
              <ActivityIndicator style={styles.loader} />
            ) : requests.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No projects yet.</Text>
                <Text style={styles.emptyHint}>
                  Tap "Start Building" to create your first request.
                </Text>
              </View>
            ) : (
              requests.map((item) => (
                <ProjectRequestCard key={item.id} request={item} />
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 20, paddingBottom: 40 },
  hero: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#fff' },
  heroSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  suggestBtn: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  suggestBtnText: { color: '#111', fontWeight: '700', fontSize: 14 },
  aiError: { color: '#ff6b6b', fontSize: 13 },
  suggestion: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20 },
  buildBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  buildBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  projectsSection: { gap: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
  loader: { marginTop: 40 },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#333' },
  emptyHint: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
