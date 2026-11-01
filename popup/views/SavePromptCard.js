/**
 * @file apps/extension/src/popup/views/SavePromptCard.tsx
 * @description Arca by Pixra — Pinned Top-of-Popup Save / Update Credential Banner (`bg-zinc-900`, `border-emerald-500/40`).
 */

import React, { useEffect, useCallback } from 'react';
import { Button, useI18n } from '@vaultguard/ui';
import { ShieldPlus, X } from 'lucide-react';
export function SavePromptCard({
  candidate,
  onConfirmSave,
  onDismiss
}) {
  const {
    t
  } = useI18n();
  const handleKeyDown = useCallback(e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void onConfirmSave(candidate);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      void onDismiss(candidate);
    }
  }, [candidate, onConfirmSave, onDismiss]);
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
  return /*#__PURE__*/React.createElement("section", {
    role: "region",
    "aria-labelledby": "save-prompt-heading",
    className: "ps-3 pe-3 pt-3 pb-3 bg-zinc-900/95 border-b border-emerald-500/40 text-zinc-50 text-start space-y-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(ShieldPlus, {
    className: "w-4 h-4 text-emerald-500 shrink-0",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("h2", {
    id: "save-prompt-heading",
    className: "text-xs font-bold text-emerald-400"
  }, candidate.isUpdate ? t('savePrompt.title.update') : t('savePrompt.title.new'))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": t('savePrompt.dismiss.button'),
    onClick: () => void onDismiss(candidate),
    className: "ps-1 pe-1 pt-1 pb-1 rounded text-zinc-400 hover:text-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
  }, /*#__PURE__*/React.createElement(X, {
    className: "w-3.5 h-3.5",
    "aria-hidden": "true"
  }))), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-300"
  }, t('savePrompt.subtitle', {
    domain: candidate.domain
  }), " (", candidate.username, ")"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 pt-1"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "emerald",
    className: "flex-1",
    onClick: () => void onConfirmSave(candidate)
  }, candidate.isUpdate ? t('savePrompt.update.button') : t('savePrompt.save.button')), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    onClick: () => void onDismiss(candidate)
  }, t('savePrompt.dismiss.button'))));
}