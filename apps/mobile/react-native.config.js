module.exports = {
  dependencies: {
    'react-native-code-push': {
      platforms: {
        android: {
          sourceDir: '../node_modules/react-native-code-push/android/app',
        },
      },
    },
    'react-native-sodium-jsi': {
      platforms: {
        android: null,
      },
    },
    'react-native-jail-monkey': {
      platforms: {
        android: null,
      },
    },
  },
};

