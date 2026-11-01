/**
 * @file apps/extension/src/popup/views/TotpWarningBanner.tsx
 * @description Mandatory Co-Location Security Warning Banner (`TOTP_SPEC.md` v1.1 §5).
 * Displayed when storing a 2FA TOTP secret inside the same vault item as a login password.
 */

import React from 'react';
import { useI18n } from '@vaultguard/ui';
import { AlertTriangle } from 'lucide-react';
export function TotpWarningBanner() {
  const {
    t
  } = useI18n();
  return /*#__PURE__*/React.createElement("div", {
    role: "note",
    "aria-label": t('totp.warning.title'),
    className: "ps-3 pe-3 pt-2.5 pb-2.5 rounded-md border border-amber-700/80 bg-amber-950/70 text-amber-100 text-start space-y-1"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement(AlertTriangle, {
    className: "w-4 h-4 text-amber-400 shrink-0",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-xs font-bold text-amber-200"
  }, t('totp.warning.title'))), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-amber-100/90 leading-relaxed"
  }, t('totp.warning.body')));
}