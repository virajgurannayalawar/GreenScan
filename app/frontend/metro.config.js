const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

/**
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // .tif fixtures can be bundled as assets for local testing without a
    // document picker round-trip.
    assetExts: [...defaultConfig.resolver.assetExts, 'tif', 'tiff', 'onnx'],
  },
};

module.exports = mergeConfig(defaultConfig, config);
