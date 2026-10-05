// Any test that reaches a persisted zustand store (pendingIntentStore, via the auth
// screens) would otherwise die on "AsyncStorage is null": there is no native module
// under Jest. Tests that mock it themselves override this.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
