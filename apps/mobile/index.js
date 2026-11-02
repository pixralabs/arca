import 'react-native-get-random-values';
import 'fast-text-encoding';

if (typeof globalThis.WebAssembly === 'undefined') {
  globalThis.WebAssembly = {
    RuntimeError: class RuntimeError extends Error {},
    instantiate: () => Promise.reject(new Error('WebAssembly not supported')),
  };
}

import { AppRegistry } from 'react-native';
import App from './src/App';

AppRegistry.registerComponent('ArcaMobile', () => App);
