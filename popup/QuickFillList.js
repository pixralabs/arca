/**
 * @file apps/extension/src/popup/QuickFillList.tsx
 * @description Arca by Pixra — Pinned Top-of-Popup Quick-Fill Credential Card (`bg-zinc-900`, `border-zinc-800`, Emerald CTA).
 */

import React from 'react';
import { Button, useI18n } from '@vaultguard/ui';
import { Zap, Copy } from 'lucide-react';
export function QuickFillList({
  matchedItems,
  onFillItem,
  onCopyPassword
}) {
  const {
    t
  } = useI18n();
  if (matchedItems.length === 0) {
    return null;
  }
  return /*#__PURE__*/React.createElement("section", {
    role: "region",
    "aria-labelledby": "quick-fill-heading",
    className: "ps-3 pe-3 pt-2.5 pb-2.5 bg-zinc-900/90 border-b border-zinc-800 text-start space-y-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement(Zap, {
    className: "w-3.5 h-3.5 text-amber-500",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("h2", {
    id: "quick-fill-heading",
    className: "text-xs font-bold text-amber-400"
  }, t('quickFill.title'))), /*#__PURE__*/React.createElement("ul", {
    className: "space-y-1.5"
  }, matchedItems.map(item => /*#__PURE__*/React.createElement("li", {
    key: item.id,
    className: "ps-2.5 pe-2.5 pt-2 pb-2 rounded-lg border border-zinc-800 bg-zinc-950 flex items-center justify-between gap-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "min-w-0"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-semibold text-zinc-50 truncate"
  }, item.title), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-400 truncate"
  }, item.username)), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1.5 shrink-0"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "emerald",
    "aria-label": `${t('quickFill.fill.button')} ${String(item.title)}`,
    onClick: () => void onFillItem(item)
  }, /*#__PURE__*/React.createElement(Zap, {
    className: "w-3.5 h-3.5 me-1",
    "aria-hidden": "true"
  }), t('quickFill.fill.button')), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    "aria-label": `${t('quickFill.copy.button')} ${String(item.title)}`,
    onClick: () => void onCopyPassword(item.password)
  }, /*#__PURE__*/React.createElement(Copy, {
    className: "w-3.5 h-3.5",
    "aria-hidden": "true"
  })))))));
}