import { renderHook } from '@testing-library/react-native';
import { useColorScheme } from 'react-native';
import { useAdminPalette } from '../i18n';
import { ADMIN_LIGHT } from '../theme';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@core/stores/settingsStore', () => ({ useSettingsStore: jest.fn() }));

/** Light only for now: a phone in dark mode still gets the chat-list colours. */
it('uses the light palette even when the device is in dark mode', () => {
  (useColorScheme as jest.Mock).mockReturnValue('dark');
  expect(renderHook(() => useAdminPalette()).result.current).toBe(ADMIN_LIGHT);
});
