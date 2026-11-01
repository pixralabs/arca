/**
 * @file apps/extension/src/popup/App.tsx
 * @description Arca by Pixra — Root Popup Application routing across all 7 Vault Lifecycle States
 * with Charcoal (`bg-zinc-950`, `border-zinc-800`) surfaces and Emerald/Amber/Rose accents.
 */

import React, { useEffect } from 'react';
import { Button, I18nProvider, useI18n } from '@vaultguard/ui';
import { ShieldAlert, Loader2, Lock } from 'lucide-react';
import { usePopupStore } from './store.js';
import { SetupView } from './views/SetupView.js';
import { RecoveryKitView } from './views/RecoveryKitView.js';
import { UnlockView } from './views/UnlockView.js';
import { VaultView } from './views/VaultView.js';
import { GeneratorView } from './views/GeneratorView.js';
import { SettingsView } from './views/SettingsView.js';
import { SavePromptCard } from './views/SavePromptCard.js';
import { QuickFillList } from './QuickFillList.js';
function PopupShell() {
  const {
    t
  } = useI18n();
  const lifecycleState = usePopupStore(s => s.lifecycleState);
  const isEphemeralFallback = usePopupStore(s => s.isEphemeralFallback);
  const pendingRecoveryMnemonic = usePopupStore(s => s.pendingRecoveryMnemonic);
  const pendingSaveCandidate = usePopupStore(s => s.pendingSaveCandidate);
  const confirmPendingSave = usePopupStore(s => s.confirmPendingSave);
  const dismissPendingSave = usePopupStore(s => s.dismissPendingSave);
  const items = usePopupStore(s => s.items);
  const autofillActiveTabItem = usePopupStore(s => s.autofillActiveTabItem);
  const copyToClipboardWithAutoClear = usePopupStore(s => s.copyToClipboardWithAutoClear);
  const activeTab = usePopupStore(s => s.activeTab);
  const setActiveTab = usePopupStore(s => s.setActiveTab);
  const refreshStatus = usePopupStore(s => s.refreshStatus);
  const lock = usePopupStore(s => s.lock);
  const toastMessageKey = usePopupStore(s => s.toastMessageKey);
  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);
  if (pendingRecoveryMnemonic) {
    return /*#__PURE__*/React.createElement(RecoveryKitView, null);
  }
  if (lifecycleState === 'UNINITIALIZED') {
    return /*#__PURE__*/React.createElement(SetupView, null);
  }
  if (lifecycleState === 'LOCKED') {
    return /*#__PURE__*/React.createElement(UnlockView, null);
  }
  if (lifecycleState === 'UNLOCKING') {
    return /*#__PURE__*/React.createElement("main", {
      className: "ps-4 pe-4 pt-8 pb-8 text-center bg-zinc-950 text-zinc-50"
    }, /*#__PURE__*/React.createElement(Loader2, {
      className: "w-8 h-8 text-emerald-500 animate-spin mx-auto mb-3",
      "aria-hidden": "true"
    }), /*#__PURE__*/React.createElement("h1", {
      className: "text-base font-bold text-zinc-50"
    }, t('state.unlocking.title')), /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-zinc-400 mt-1"
    }, t('state.unlocking.subtitle')));
  }
  if (lifecycleState === 'CORRUPTED' || lifecycleState === 'ROLLBACK_DETECTED') {
    const isRollback = lifecycleState === 'ROLLBACK_DETECTED';
    return /*#__PURE__*/React.createElement("main", {
      role: "alert",
      className: "ps-4 pe-4 pt-6 pb-6 text-start bg-zinc-950 text-zinc-50 border-2 border-rose-500"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2 mb-2"
    }, /*#__PURE__*/React.createElement(ShieldAlert, {
      className: "w-6 h-6 text-rose-500",
      "aria-hidden": "true"
    }), /*#__PURE__*/React.createElement("h1", {
      className: "text-base font-bold text-rose-400"
    }, isRollback ? t('state.rollback.title') : t('state.corrupted.title'))), /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-zinc-300"
    }, isRollback ? t('state.rollback.subtitle') : t('state.corrupted.subtitle')));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "w-96 min-h-96 bg-zinc-950 text-zinc-50 flex flex-col justify-between"
  }, /*#__PURE__*/React.createElement("header", {
    className: "ps-4 pe-4 pt-3 pb-2 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-sm font-bold text-emerald-500"
  }, t('app.title')), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    "aria-label": t('nav.lock'),
    onClick: () => void lock()
  }, /*#__PURE__*/React.createElement(Lock, {
    className: "w-4 h-4 text-amber-500",
    "aria-hidden": "true"
  }))), pendingSaveCandidate ? /*#__PURE__*/React.createElement(SavePromptCard, {
    candidate: pendingSaveCandidate,
    onConfirmSave: async cand => {
      await confirmPendingSave(cand);
    },
    onDismiss: dismissPendingSave
  }) : null, activeTab === 'vault' && items.length > 0 ? /*#__PURE__*/React.createElement(QuickFillList, {
    matchedItems: items.slice(0, 2),
    onFillItem: async it => {
      await autofillActiveTabItem(it);
    },
    onCopyPassword: copyToClipboardWithAutoClear
  }) : null, isEphemeralFallback || lifecycleState === 'EPHEMERAL_FALLBACK' ? /*#__PURE__*/React.createElement("div", {
    role: "status",
    className: "ps-3 pe-3 pt-1.5 pb-1.5 bg-amber-950/90 border-b border-amber-500/40 text-amber-200 text-xs text-start"
  }, t('state.ephemeral.banner')) : null, /*#__PURE__*/React.createElement("main", {
    className: "flex-1"
  }, activeTab === 'vault' ? /*#__PURE__*/React.createElement(VaultView, null) : null, activeTab === 'generator' ? /*#__PURE__*/React.createElement(GeneratorView, null) : null, activeTab === 'settings' ? /*#__PURE__*/React.createElement(SettingsView, null) : null), toastMessageKey ? /*#__PURE__*/React.createElement("div", {
    role: "status",
    "aria-live": "polite",
    className: "ps-3 pe-3 pt-2 pb-2 bg-emerald-950 border-t border-emerald-500/40 text-emerald-200 text-xs text-start"
  }, t('vault.copied.toast')) : null, /*#__PURE__*/React.createElement("nav", {
    "aria-label": t('app.title'),
    className: "ps-2 pe-2 pt-2 pb-2 border-t border-zinc-800 bg-zinc-900/80 grid grid-cols-3 gap-1"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: activeTab === 'vault' ? 'emerald' : 'ghost',
    onClick: () => setActiveTab('vault')
  }, t('nav.vault')), /*#__PURE__*/React.createElement(Button, {
    variant: activeTab === 'generator' ? 'emerald' : 'ghost',
    onClick: () => setActiveTab('generator')
  }, t('nav.generator')), /*#__PURE__*/React.createElement(Button, {
    variant: activeTab === 'settings' ? 'emerald' : 'ghost',
    onClick: () => setActiveTab('settings')
  }, t('nav.settings'))));
}
export function App() {
  return /*#__PURE__*/React.createElement(I18nProvider, null, /*#__PURE__*/React.createElement(PopupShell, null));
}