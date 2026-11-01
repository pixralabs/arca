/**
 * @file apps/extension/src/popup/views/SettingsView.tsx
 * @description Arca by Pixra — Language Switcher, Auto-Lock Timeout, and Blind Relay Sync Settings
 * with Charcoal (`bg-zinc-950`, `bg-zinc-900`, `border-zinc-800`) surfaces and Emerald/Amber/Rose accents.
 */

import React, { useState } from 'react';
import { Button, Input, Label, Switch, TabsRoot, TabsList, TabsTrigger, TabsContent, useI18n } from '@vaultguard/ui';
import { validateSyncServerUrl } from '@vaultguard/crypto';
import { usePopupStore } from '../store.js';
export function SettingsView() {
  const {
    locale,
    setLocale,
    t
  } = useI18n();
  const autoLockMinutes = usePopupStore(s => s.autoLockMinutes);
  const syncEnabled = usePopupStore(s => s.syncEnabled);
  const syncServerUrl = usePopupStore(s => s.syncServerUrl);
  const updateSyncSettings = usePopupStore(s => s.updateSyncSettings);
  const lock = usePopupStore(s => s.lock);
  const [serverUrlInput, setServerUrlInput] = useState(syncServerUrl);
  const [syncToggle, setSyncToggle] = useState(syncEnabled);
  const [urlError, setUrlError] = useState(false);
  const handleLanguageChange = next => {
    void setLocale(next);
  };
  const handleSaveSync = async e => {
    e.preventDefault();
    try {
      const normalized = validateSyncServerUrl(serverUrlInput);
      setUrlError(false);
      setServerUrlInput(normalized);
      await updateSyncSettings(syncToggle, normalized);
    } catch {
      setUrlError(true);
    }
  };
  return /*#__PURE__*/React.createElement("section", {
    "aria-labelledby": "settings-heading",
    className: "ps-4 pe-4 pt-3 pb-3 text-start bg-zinc-950 text-zinc-50 space-y-4"
  }, /*#__PURE__*/React.createElement("h1", {
    id: "settings-heading",
    className: "text-sm font-bold text-zinc-50"
  }, t('settings.title')), /*#__PURE__*/React.createElement(TabsRoot, {
    defaultValue: "general",
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement(TabsList, {
    className: "grid grid-cols-2 gap-1 ps-1 pe-1 pt-1 pb-1 rounded-lg bg-zinc-900 border border-zinc-800"
  }, /*#__PURE__*/React.createElement(TabsTrigger, {
    value: "general",
    className: "ps-2 pe-2 pt-1.5 pb-1.5 rounded text-xs font-semibold text-zinc-300 data-[state=active]:bg-emerald-500 data-[state=active]:text-zinc-950"
  }, t('settings.tab.general')), /*#__PURE__*/React.createElement(TabsTrigger, {
    value: "sync",
    className: "ps-2 pe-2 pt-1.5 pb-1.5 rounded text-xs font-semibold text-zinc-300 data-[state=active]:bg-emerald-500 data-[state=active]:text-zinc-950"
  }, t('settings.tab.sync'))), /*#__PURE__*/React.createElement(TabsContent, {
    value: "general",
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "lang-select"
  }, t('settings.language')), /*#__PURE__*/React.createElement("div", {
    id: "lang-select",
    className: "flex items-center gap-2 mt-1"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: locale === 'en' ? 'emerald' : 'secondary',
    onClick: () => handleLanguageChange('en')
  }, t('settings.language.en')), /*#__PURE__*/React.createElement(Button, {
    variant: locale === 'hi' ? 'emerald' : 'secondary',
    onClick: () => handleLanguageChange('hi')
  }, t('settings.language.hi')))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "autolock-display"
  }, t('settings.autoLock')), /*#__PURE__*/React.createElement("p", {
    id: "autolock-display",
    className: "text-xs text-zinc-300"
  }, autoLockMinutes, " min"))), /*#__PURE__*/React.createElement(TabsContent, {
    value: "sync",
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("form", {
    onSubmit: handleSaveSync,
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "sync-enable-switch",
    className: "mb-0"
  }, t('settings.sync.enable')), /*#__PURE__*/React.createElement(Switch, {
    id: "sync-enable-switch",
    checked: syncToggle,
    onCheckedChange: setSyncToggle
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "sync-server-url-input"
  }, t('settings.sync.serverUrl.label')), /*#__PURE__*/React.createElement(Input, {
    id: "sync-server-url-input",
    type: "url",
    value: serverUrlInput,
    placeholder: t('settings.sync.serverUrl.placeholder'),
    onChange: e => setServerUrlInput(e.target.value),
    required: true
  }), urlError ? /*#__PURE__*/React.createElement("p", {
    role: "alert",
    className: "text-xs text-rose-500 mt-1"
  }, t('settings.sync.error.url')) : null), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-400 leading-relaxed"
  }, t('settings.sync.cspNote')), /*#__PURE__*/React.createElement(Button, {
    type: "submit",
    variant: "emerald",
    className: "w-full"
  }, t('settings.sync.save.button'))))), /*#__PURE__*/React.createElement("div", {
    className: "pt-2 border-t border-zinc-800 space-y-2"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "danger",
    className: "w-full",
    onClick: () => void lock()
  }, t('nav.lock'))));
}