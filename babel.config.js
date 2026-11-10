module.exports = function (api) {
  // Keyed on NODE_ENV so a production (release) bundle and a dev/test run don't
  // share a cached config. Metro sets NODE_ENV=production for release bundles.
  const isProduction = api.cache.using(() => process.env.NODE_ENV === 'production');
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Release only: strip console.log/info/debug (see babel/removeConsole.js).
      ...(isProduction ? [require('./babel/removeConsole')] : []),
      'react-native-reanimated/plugin',
    ],
  };
};
