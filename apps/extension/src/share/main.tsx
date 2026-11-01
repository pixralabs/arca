/**
 * @file apps/extension/src/share/main.tsx
 * @description One-Time Secure Share Entrypoint.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ShareView } from './ShareView.js';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <ShareView />
    </React.StrictMode>
  );
}
