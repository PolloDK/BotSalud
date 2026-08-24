module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    'react-native-health-connect': '<rootDir>/__mocks__/react-native-health-connect.js',
    'react-native-background-fetch': '<rootDir>/__mocks__/react-native-background-fetch.js',
    '@react-native-async-storage/async-storage':
      '<rootDir>/__mocks__/async-storage.js',
  },
};
