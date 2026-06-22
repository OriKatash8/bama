import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image } from 'react-native';
import { Screen } from '@components/layout/Screen';
import { useAiCrewSuggestion } from '@features/crew/hooks';
import { useTheme } from '@core/hooks/useTheme';

export default function HomeScreen() {
  const { suggest, suggestion, isLoading: aiLoading, error: aiError } = useAiCrewSuggestion();
  const [description, setDescription] = useState('');
  const colors = useTheme();

  const apiKeyPresent = !!process.env.EXPO_PUBLIC_CLAUDE_API_KEY;

  const gradientText = Platform.OS === 'web' ? ({
    background: 'linear-gradient(to right, #004aad, #cb6ce6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  } as any) : {};

  const gradientBtn = Platform.OS === 'web' ? ({
    background: 'linear-gradient(to right, #004aad, #cb6ce6)',
  } as any) : {};

  const cardGlow = Platform.OS === 'web' ? ({
    boxShadow: '0 0 40px #7b4fd466, 0 0 80px #004aad33',
  } as any) : {};

  return (
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bg }]}>
      <Screen scrollable={false}>
        <ScrollView style={[styles.flex, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content}>
          <View style={styles.bamaWrap}>
            <Image source={require('../../../../../assets/images/bama-logo.png')} style={styles.bamaLogo} resizeMode="contain" />
          </View>

          <View style={[styles.hero, cardGlow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.heroTitle, { color: colors.text }, gradientText]}>Build Your Crew</Text>

            {apiKeyPresent && (
              <>
                <Text style={[styles.heroSubtitle, { color: colors.textSec }]}>
                  Describe your project for AI crew suggestions
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                  placeholder="E.g. I'm shooting a wedding in Dubai for 200 guests…"
                  placeholderTextColor={colors.placeholder}
                  multiline
                  numberOfLines={3}
                  value={description}
                  onChangeText={setDescription}
                />
                {description.trim().length > 0 && (
                  <TouchableOpacity
                    style={[styles.suggestBtn, gradientBtn, aiLoading && styles.btnDisabled]}
                    onPress={() => suggest(description.trim())}
                    disabled={aiLoading}
                    activeOpacity={0.8}
                  >
                    {aiLoading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.suggestBtnText}>✦ Get Suggestions</Text>
                    )}
                  </TouchableOpacity>
                )}
                {aiError != null && (
                  <Text style={styles.aiError}>{aiError}</Text>
                )}
                {suggestion != null && (
                  <Text style={[styles.suggestion, { color: colors.textSec }]}>{suggestion}</Text>
                )}
              </>
            )}

            <TouchableOpacity
              style={[styles.buildBtn, gradientBtn]}
              onPress={() => router.push('/(client)/(tabs)/home/builder')}
              activeOpacity={0.8}
            >
              <Text style={styles.buildBtnText}>Start Building →</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 16, paddingBottom: 40, gap: 20 },
  bamaWrap: { alignItems: 'center', width: '100%' },
  bamaLogo: { width: 1040, height: 520 },
  hero: {
    borderRadius: 20,
    padding: 20,
    gap: 12,
    marginHorizontal: 16,
    borderWidth: 1,
  },
  heroTitle: { fontSize: 26, fontWeight: '800' },
  heroSubtitle: { fontSize: 13 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  suggestBtn: {
    backgroundColor: '#004aad',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  suggestBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  aiError: { color: '#ff6b6b', fontSize: 13 },
  suggestion: { fontSize: 14, lineHeight: 20 },
  buildBtn: {
    backgroundColor: '#004aad',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buildBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
