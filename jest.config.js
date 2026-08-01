module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@features/(.*)$': '<rootDir>/src/features/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    // Force CJS builds so Jest doesn't choke on ESM .mjs files
    '^lucide-react-native$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
    '^firebase/app$': '<rootDir>/node_modules/firebase/app/dist/index.cjs.js',
    '^firebase/auth$': '<rootDir>/node_modules/firebase/auth/dist/index.cjs.js',
    '^firebase/firestore$': '<rootDir>/node_modules/firebase/firestore/dist/index.cjs.js',
    '^firebase/storage$': '<rootDir>/node_modules/firebase/storage/dist/index.cjs.js',
    '^firebase/database$': '<rootDir>/node_modules/firebase/database/dist/index.cjs.js',
    '^firebase/functions$': '<rootDir>/node_modules/firebase/functions/dist/index.cjs.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|standard-navigation)',
  ],
};
