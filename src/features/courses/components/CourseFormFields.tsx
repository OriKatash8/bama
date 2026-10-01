import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { uploadFile } from '@core/firebase/storage';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { rtlSafe } from '@utils/formatters';
import { ROLE_CATEGORIES, categoryLabel } from '@features/crew/data/categories';
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

const CATEGORIES = ROLE_CATEGORIES;

export type CourseLevel = '' | 'beginner' | 'intermediate' | 'advanced';

/** A course form's values, as typed. Numbers stay strings until saved. */
export type CourseDraft = {
  title: string;
  category: string;
  courseUrl: string;
  instructorName: string;
  price: string;
  description: string;
  /** A picked local image, or the saved cover's URL when editing. */
  coverUri: string | null;
  durationHours: string;
  lessonsCount: string;
  level: CourseLevel;
};

export const EMPTY_COURSE_DRAFT: CourseDraft = {
  title: '',
  category: '',
  courseUrl: '',
  instructorName: '',
  price: '',
  description: '',
  coverUri: null,
  durationHours: '',
  lessonsCount: '',
  level: '',
};

/** The fields marked * are filled. */
export function courseDraftComplete(d: CourseDraft): boolean {
  return !!(d.title.trim() && d.category && d.courseUrl.trim() && d.instructorName.trim());
}

/** Uploads a newly picked cover; a cover that is already a URL is kept as is. */
export async function uploadCourseCover(uri: string): Promise<string> {
  if (/^https?:\/\//.test(uri)) return uri;
  const blob = await fetch(uri).then((r) => r.blob());
  return uploadFile(`course-images/${Date.now()}.jpg`, blob);
}

/**
 * The course form's fields — title, category, link, instructor, price,
 * description, cover, duration + lessons, level — shared by the pro's
 * "Add your course" popup and the admin's add / edit course popup, so both
 * ask for the same things in the same way.
 */
export function CourseFormFields({
  value,
  onChange,
}: {
  value: CourseDraft;
  onChange: (patch: Partial<CourseDraft>) => void;
}) {
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  /** Prose reads from the side the language starts on. Applied to every label
   *  and the category list — the inputs and rows already flipped, but the text
   *  inside them did not, so the Hebrew form hugged the wrong edge. */
  const align = { textAlign: rtl ? 'right' : 'left' } as const;
  const inputStyle: StyleProp<TextStyle> = [styles.input, { textAlign: rtl ? 'right' : 'left', ...font.regular }];

  /** A field label. `required` appends the marker on the READING side: the app
   *  lays out LTR, so a trailing "*" after Hebrew falls to the LTR end and
   *  lands in front of the words. rtlSafe anchors it. `optional` says so in
   *  words, for a field that is easy to mistake for required. */
  const fieldLabel = (key: string, required = false, optional = false) => (
    <Text style={[styles.label, { ...font.semiBold }, align]}>
      {rtlSafe(required ? `${t(key)} *` : optional ? `${t(key)} ${t('builder.optional_note')}` : t(key), rtl)}
    </Text>
  );

  async function handlePickCover() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as const,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled) onChange({ coverUri: result.assets[0].uri });
  }

  return (
    <>
      {/* Title */}
      {fieldLabel('courses.course_title_label', true)}
      <TextInput
        testID="input-title"
        style={inputStyle}
        value={value.title}
        onChangeText={(v) => onChange({ title: v })}
        placeholder={t('courses.course_title_label')}
        placeholderTextColor={PLACEHOLDER}
      />

      {/* Category */}
      {fieldLabel('courses.course_category', true)}
      <TouchableOpacity
        testID="input-category"
        style={styles.input}
        onPress={() => setShowCategoryPicker(!showCategoryPicker)}
        activeOpacity={0.8}
      >
        <Text style={[{ color: value.category ? TEXT : PLACEHOLDER, ...font.regular }, align]}>
          {/* The localised name. `category` itself stays the raw
              ROLE_CATEGORIES key — it is what the document is saved
              under — so echoing it put an English word in the middle
              of a Hebrew form. */}
          {value.category ? categoryLabel(value.category, rtl ? 'he' : 'en') : t('courses.select_category')}
        </Text>
      </TouchableOpacity>
      {showCategoryPicker && (
        <View style={styles.picker}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={styles.pickerItem}
              onPress={() => { onChange({ category: cat }); setShowCategoryPicker(false); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.pickerItemText, { ...font.regular }, align]}>{categoryLabel(cat, rtl ? 'he' : 'en')}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Link */}
      {fieldLabel('courses.course_link', true)}
      <TextInput
        testID="input-courseUrl"
        style={inputStyle}
        value={value.courseUrl}
        onChangeText={(v) => onChange({ courseUrl: v })}
        placeholder="https://..."
        placeholderTextColor={PLACEHOLDER}
        autoCapitalize="none"
        keyboardType="url"
      />

      {/* Instructor */}
      {fieldLabel('courses.instructor_label', true)}
      <TextInput
        testID="input-instructorName"
        style={inputStyle}
        value={value.instructorName}
        onChangeText={(v) => onChange({ instructorName: v })}
        placeholder={t('courses.instructor_label')}
        placeholderTextColor={PLACEHOLDER}
      />

      {/* Price */}
      {fieldLabel('courses.price_label')}
      <TextInput
        testID="input-price"
        style={inputStyle}
        value={value.price}
        onChangeText={(v) => onChange({ price: v })}
        placeholder="0"
        placeholderTextColor={PLACEHOLDER}
        keyboardType="numeric"
      />

      {/* Description */}
      {fieldLabel('courses.description_label')}
      <TextInput
        testID="input-description"
        style={[styles.input, styles.inputMulti, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}
        value={value.description}
        onChangeText={(v) => onChange({ description: v })}
        placeholder={t('courses.description_label')}
        placeholderTextColor={PLACEHOLDER}
        multiline
        numberOfLines={3}
      />

      {/* Cover image */}
      {fieldLabel('courses.cover_image_label')}
      <TouchableOpacity testID="input-cover" style={styles.coverPickerBtn} onPress={handlePickCover} activeOpacity={0.8}>
        {value.coverUri ? (
          <Image source={{ uri: value.coverUri }} style={styles.coverPreview} contentFit="cover" />
        ) : (
          <Text style={[styles.coverPickerText, { ...font.regular }]}>{t('courses.add_cover_image')}</Text>
        )}
      </TouchableOpacity>

      {/* Duration + lessons */}
      <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          {fieldLabel('courses.duration_label')}
          <TextInput
            testID="input-durationHours"
            style={inputStyle}
            value={value.durationHours}
            onChangeText={(v) => onChange({ durationHours: v })}
            placeholder="0"
            placeholderTextColor={PLACEHOLDER}
            keyboardType="numeric"
          />
        </View>
        <View style={{ flex: 1 }}>
          {fieldLabel('courses.lessons_label')}
          <TextInput
            testID="input-lessonsCount"
            style={inputStyle}
            value={value.lessonsCount}
            onChangeText={(v) => onChange({ lessonsCount: v })}
            placeholder="0"
            placeholderTextColor={PLACEHOLDER}
            keyboardType="numeric"
          />
        </View>
      </View>

      {/* Level */}
      {fieldLabel('courses.level_label', false, true)}
      <View style={[styles.levelRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        {(['beginner', 'intermediate', 'advanced'] as const).map((key) => {
          const active = value.level === key;
          return (
            <TouchableOpacity
              key={key}
              testID={`level-${key}`}
              style={[styles.levelBtn, active && styles.levelBtnActive]}
              onPress={() => onChange({ level: active ? '' : key })}
              activeOpacity={0.8}
            >
              <Text style={[styles.levelBtnText, { ...font.semiBold }, active && styles.levelBtnTextActive]}>
                {t(`courses.level_${key}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

// Black text throughout; placeholders a muted grey so they don't read as values.
// The blue stays on buttons and the chosen difficulty (white text on it).
export const COURSE_FORM_TEXT = '#000000';
const TEXT = COURSE_FORM_TEXT;
const PLACEHOLDER = '#9C99AD';

const styles = StyleSheet.create({
  label: { fontSize: 13, color: TEXT, marginBottom: 4, marginTop: 12 },
  input: {
    backgroundColor: '#ffffff',
    borderColor: 'rgba(0,74,173,0.15)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: TEXT,
    fontSize: 14,
  },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  picker: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.15)',
    borderRadius: 10,
    marginTop: 4,
    overflow: 'hidden',
  },
  pickerItem: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(0,74,173,0.1)' },
  pickerItemText: { color: TEXT, fontSize: 14 },
  coverPickerBtn: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(0,74,173,0.3)',
    borderStyle: 'dashed',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverPreview: { width: '100%', height: '100%' },
  coverPickerText: { color: TEXT, fontSize: 13, textAlign: 'center' },
  levelRow: { gap: 8 },
  levelBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.3)',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  levelBtnActive: { backgroundColor: '#004aad', borderColor: '#004aad' },
  levelBtnText: { fontSize: 12, color: TEXT, textAlign: 'center' },
  levelBtnTextActive: { color: '#fff' },
});
