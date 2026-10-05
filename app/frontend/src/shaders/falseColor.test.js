jest.mock('@shopify/react-native-skia', () => ({
  Skia: { RuntimeEffect: { Make: jest.fn() } },
}));

const { resolveDisplayMapping } = require('./falseColor');

describe('resolveDisplayMapping', () => {
  it('uses the source RGB channel order for three-band TIFFs', () => {
    const configuredMapping = {
      red: 3,
      green: 4,
      blue: 1,
      nir: 3,
      redBand: 2,
    };

    expect(resolveDisplayMapping(configuredMapping, 3)).toEqual({
      red: 0,
      green: 1,
      blue: 2,
      nir: 0,
      redBand: 2,
    });
  });

  it('retains the configured false-colour mapping for five-band TIFFs', () => {
    const configuredMapping = {
      red: 3,
      green: 4,
      blue: 1,
      nir: 3,
      redBand: 2,
    };

    expect(resolveDisplayMapping(configuredMapping, 5)).toBe(configuredMapping);
  });
});
