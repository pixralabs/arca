/**
 * @file apps/extension/src/popup/main.tsx
 * @description Popup React DOM Entrypoint.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../App.js';
const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render( /*#__PURE__*/React.createElement(React.StrictMode, null, /*#__PURE__*/React.createElement(App, null)));
}