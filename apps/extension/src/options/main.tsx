/**
 * @file apps/extension/src/options/main.tsx
 * @description Options Page React DOM Entrypoint.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { Options } from './Options.js';
const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render( /*#__PURE__*/React.createElement(React.StrictMode, null, /*#__PURE__*/React.createElement(Options, null)));
}