/**
 * Firestore rules tests that need the emulator. Kept out of the default `jest` run
 * (jest.config.js ignores *.emulator.test.*) because they cannot pass without one:
 *
 *   npm run test:rules
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/firestore-rules-tests/**/*.emulator.test.ts'],
  transform: { '\\.tsx?$': ['babel-jest', { presets: ['babel-preset-expo'] }] },
};
