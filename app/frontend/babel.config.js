module.exports = {
  presets: ['@react-native/babel-preset'],
  plugins: [
    [
      'module:react-native-dotenv',
      {
        moduleName: '@env',
        path: '.env',
        allowUndefined: false,
      },
    ],
    // Must stay last in the plugin list — Reanimated's worklet transform has to
    // run after every other transform has produced its final output.
    'react-native-reanimated/plugin',
  ],
};
