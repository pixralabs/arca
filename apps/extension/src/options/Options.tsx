/**
 * @file apps/extension/src/options/Options.tsx
 * @description Arca by Pixra — Options Page (`bg-zinc-950`, `bg-zinc-900`, `border-zinc-800`, Emerald/Amber/Rose accents).
 */

import React, { useState } from 'react';
import { Button, I18nProvider, useI18n } from '@vaultguard/ui';
import { Shield, FileSpreadsheet, FileJson, Lock } from 'lucide-react';
import { usePopupStore } from '../popup/store.js';
export function buildSanitizedDiagnostics(params) {
  return {
    format: 'arca-pixra-diagnostics',
    version: '0.4.1',
    exportedAt: Date.now(),
    lifecycleState: params.lifecycleState,
    isEphemeralFallback: params.isEphemeralFallback,
    autoLockMinutes: params.autoLockMinutes,
    itemCount: params.itemCount,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
  };
}
function OptionsInner() {
  const {
    t
  } = useI18n();
  const lifecycleState = usePopupStore(s => s.lifecycleState);
  const isEphemeralFallback = usePopupStore(s => s.isEphemeralFallback);
  const autoLockMinutes = usePopupStore(s => s.autoLockMinutes);
  const items = usePopupStore(s => s.items);
  const [diagPreview, setDiagPreview] = useState(null);
  const handleGenerateDiagnostics = () => {
    const bundle = buildSanitizedDiagnostics({
      lifecycleState,
      isEphemeralFallback,
      autoLockMinutes,
      itemCount: items.length
    });
    setDiagPreview(JSON.stringify(bundle, null, 2));
  };
  return /*#__PURE__*/React.createElement("main", {
    className: "max-w-2xl mx-auto ps-6 pe-6 pt-6 pb-6 text-start bg-zinc-950 text-zinc-50 space-y-6"
  }, /*#__PURE__*/React.createElement("header", {
    className: "flex items-center gap-2 border-b border-zinc-800 pb-4"
  }, /*#__PURE__*/React.createElement(Shield, {
    className: "w-6 h-6 text-emerald-500",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-lg font-bold text-zinc-50"
  }, t('settings.title')), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-400"
  }, t('app.tagline')))), /*#__PURE__*/React.createElement("section", {
    className: "ps-4 pe-4 pt-4 pb-4 rounded-xl border border-zinc-800 bg-zinc-900/80 space-y-3"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-sm font-bold text-zinc-50"
  }, t('settings.exportEncrypted')), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-2"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "emerald"
  }, /*#__PURE__*/React.createElement(Lock, {
    className: "w-4 h-4 me-1",
    "aria-hidden": "true"
  }), t('settings.exportEncrypted')), /*#__PURE__*/React.createElement(Button, {
    variant: "danger"
  }, /*#__PURE__*/React.createElement(FileSpreadsheet, {
    className: "w-4 h-4 me-1",
    "aria-hidden": "true"
  }), t('settings.exportCsv'))), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-amber-500"
  }, t('settings.exportCsv.warning'))), /*#__PURE__*/React.createElement("section", {
    className: "ps-4 pe-4 pt-4 pb-4 rounded-xl border border-zinc-800 bg-zinc-900/80 space-y-3"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-sm font-bold text-zinc-50"
  }, t('settings.diagnostics')), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    onClick: handleGenerateDiagnostics
  }, /*#__PURE__*/React.createElement(FileJson, {
    className: "w-4 h-4 me-1 text-amber-500",
    "aria-hidden": "true"
  }), t('settings.diagnostics')), diagPreview ? /*#__PURE__*/React.createElement("pre", {
    className: "ps-3 pe-3 pt-2 pb-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-emerald-400 overflow-x-auto"
  }, diagPreview) : null));
}
export function Options() {
  return /*#__PURE__*/React.createElement(I18nProvider, null, /*#__PURE__*/React.createElement(OptionsInner, null));
}