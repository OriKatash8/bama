// Any test that reaches a persisted zustand store (pendingIntentStore, via the auth
// screens) would otherwise die on "AsyncStorage is null": there is no native module
// under Jest. Tests that mock it themselves override this.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// react-native-keyboard-controller is native-only; the library ships its own Jest mock
// (KeyboardProvider, KeyboardAwareScrollView, KeyboardAvoidingView, hooks).
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));
