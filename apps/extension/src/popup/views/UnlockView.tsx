/**
 * @file apps/extension/src/popup/views/UnlockView.tsx
 * @description Arca by Pixra — Premium Charcoal Vault Unlock View (`bg-zinc-950`, `bg-zinc-900/80 backdrop-blur-md`,
 * `border-zinc-800`, `text-zinc-50`, Amber-500 Gold Key icon, and Emerald-500 primary Unlock CTA).
 * Strictly uses Charcoal, Emerald, Amber, and Rose palette.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Input, Label, useI18n } from '@vaultguard/ui';
import { BIOMETRIC_MAX_STRIKES } from '@vaultguard/shared';
import { Lock, Fingerprint, KeyRound } from 'lucide-react';
import { usePopupStore } from '../store.js';
export function UnlockView() {
  const {
    t
  } = useI18n();
  const unlockWithMasterPassword = usePopupStore(s => s.unlockWithMasterPassword);
  const unlockWithRecoveryPhrase = usePopupStore(s => s.unlockWithRecoveryPhrase);
  const unlockWithBiometrics = usePopupStore(s => s.unlockWithBiometrics);
  const hasBiometricSlot = usePopupStore(s => s.hasBiometricSlot);
  const biometricStrikes = usePopupStore(s => s.biometricStrikes);
  const backoffMs = usePopupStore(s => s.backoffMs);
  const errorCode = usePopupStore(s => s.errorCode);
  const [useRecoveryMode, setUseRecoveryMode] = useState(false);
  const [masterPassword, setMasterPassword] = useState('');
  const [recoveryMnemonic, setRecoveryMnemonic] = useState('');
  const biometricsDisabledByStrikes = biometricStrikes >= BIOMETRIC_MAX_STRIKES;
  const handleSubmit = async e => {
    e.preventDefault();
    if (useRecoveryMode) {
      await unlockWithRecoveryPhrase(recoveryMnemonic);
      setRecoveryMnemonic('');
    } else {
      await unlockWithMasterPassword(masterPassword);
      setMasterPassword('');
    }
  };
  return /*#__PURE__*/React.createElement(motion.section, {
    initial: {
      opacity: 0,
      y: 8
    },
    animate: {
      opacity: 1,
      y: 0
    },
    transition: {
      duration: 0.18
    },
    "aria-labelledby": "unlock-heading",
    className: "ps-4 pe-4 pt-5 pb-5 text-start bg-zinc-950 text-zinc-50 font-sans"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ps-4 pe-4 pt-4 pb-4 rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md shadow-2xl space-y-3.5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2.5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-8 h-8 rounded-lg bg-zinc-950 border border-zinc-700/50 flex items-center justify-center shadow-inner"
  }, /*#__PURE__*/React.createElement(Lock, {
    className: "w-4 h-4 text-emerald-500",
    "aria-hidden": "true"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    id: "unlock-heading",
    className: "text-base font-bold tracking-tight text-zinc-50"
  }, t('state.locked.title')), /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] font-mono text-amber-500"
  }, "Arca by Pixra \xB7 Zero-Knowledge Vault"))), /*#__PURE__*/React.createElement(KeyRound, {
    className: "w-4 h-4 text-amber-500",
    "aria-hidden": "true"
  })), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-400 leading-relaxed"
  }, t('state.locked.subtitle')), hasBiometricSlot && !biometricsDisabledByStrikes ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "secondary",
    "aria-label": t('unlock.biometrics.button'),
    className: "w-full",
    onClick: () => void unlockWithBiometrics()
  }, /*#__PURE__*/React.createElement(Fingerprint, {
    className: "w-4 h-4 me-1.5 text-emerald-500",
    "aria-hidden": "true"
  }), t('unlock.biometrics.button'))) : null, biometricsDisabledByStrikes ? /*#__PURE__*/React.createElement("p", {
    role: "alert",
    className: "text-xs font-medium text-amber-500"
  }, t('unlock.biometrics.disabled')) : null, backoffMs > 0 ? /*#__PURE__*/React.createElement("p", {
    role: "alert",
    className: "text-xs font-medium text-amber-500"
  }, t('unlock.backoff.message', {
    seconds: Math.ceil(backoffMs / 1000)
  })) : null, /*#__PURE__*/React.createElement("form", {
    onSubmit: handleSubmit,
    className: "space-y-3"
  }, useRecoveryMode ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "unlock-recovery-input"
  }, t('unlock.recovery.label')), /*#__PURE__*/React.createElement(Input, {
    id: "unlock-recovery-input",
    type: "text",
    className: "font-mono",
    autoComplete: "off",
    value: recoveryMnemonic,
    onChange: e => setRecoveryMnemonic(e.target.value),
    placeholder: t('unlock.recovery.placeholder'),
    required: true
  })) : /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "unlock-master-input"
  }, t('unlock.masterPassword.label')), /*#__PURE__*/React.createElement(Input, {
    id: "unlock-master-input",
    type: "password",
    className: "font-mono",
    autoComplete: "current-password",
    value: masterPassword,
    onChange: e => setMasterPassword(e.target.value),
    required: true
  })), errorCode ? /*#__PURE__*/React.createElement("p", {
    role: "alert",
    className: "text-xs font-medium text-rose-500"
  }, t('unlock.error.invalid')) : null, /*#__PURE__*/React.createElement(Button, {
    type: "submit",
    variant: "emerald",
    className: "w-full"
  }, t('unlock.button')), /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "ghost",
    className: "w-full",
    onClick: () => setUseRecoveryMode(prev => !prev)
  }, useRecoveryMode ? t('unlock.useMaster') : t('unlock.useRecovery')))));
}