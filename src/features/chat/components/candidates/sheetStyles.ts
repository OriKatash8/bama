import { StyleSheet } from 'react-native';

/** Bottom-sheet look shared with ContestEngagementSheet (white sheet, blue confirm). */
export const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '85%',
  },
  title: { fontSize: 19, marginBottom: 6 },
  body: { fontSize: 14, marginBottom: 14, lineHeight: 20 },
  label: { fontSize: 12, marginTop: 6, marginBottom: 6 },
  input: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
  },
  multiline: { minHeight: 76, textAlignVertical: 'top' },
  counter: { fontSize: 11, marginTop: 4 },
  option: {
    borderWidth: 1, borderRadius: 14, borderColor: 'rgba(30,79,163,0.12)',
    paddingHorizontal: 14, paddingVertical: 11, marginBottom: 8, gap: 2,
  },
  optionSelected: { borderColor: '#004aad', backgroundColor: 'rgba(0,74,173,0.05)' },
  confirm: {
    backgroundColor: '#004aad', borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, marginTop: 14, minHeight: 50,
  },
  confirmDanger: { backgroundColor: '#d64545' },
  confirmDisabled: { opacity: 0.45 },
  confirmText: { fontSize: 15, color: '#ffffff' },
  notNow: { alignItems: 'center', paddingVertical: 14 },
  notNowText: { fontSize: 14 },
  error: { fontSize: 12, color: '#d64545', marginTop: 6 },
});
