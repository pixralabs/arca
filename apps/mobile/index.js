import 'react-native-get-random-values';
import 'fast-text-encoding';

const NativeTextDecoder = globalThis.TextDecoder;
if (NativeTextDecoder) {
  try {
    new NativeTextDecoder('utf-8', { fatal: true });
  } catch (_) {
    globalThis.TextDecoder = class SafeTextDecoder {
      constructor(encoding = 'utf-8', options = {}) {
        this.decoder = new NativeTextDecoder(encoding);
      }
      decode(input, options) {
        return this.decoder.decode(input, options);
      }
    };
  }
}

if (typeof globalThis.WebAssembly === 'undefined') {
  globalThis.WebAssembly = {
    RuntimeError: class RuntimeError extends Error {},
    instantiate: () => Promise.reject(new Error('WebAssembly not supported')),
  };
}

import { AppRegistry } from 'react-native';
import App from './src/App';

AppRegistry.registerComponent('ArcaMobile', () => App);
