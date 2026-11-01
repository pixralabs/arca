/**
 * @file apps/extension/src/popup/views/SetupView.tsx
 * @description Arca by Pixra — Zero-Knowledge Vault Creation View (`bg-zinc-950`, `bg-zinc-900/80`, Emerald-500 CTA).
 */

import React, { useState } from 'react';
import { Button, Input, Label, useI18n } from '@vaultguard/ui';
import { ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { usePopupStore } from '../store.js';
export function SetupView() {
  const {
    t
  } = useI18n();
  const setupVault = usePopupStore(s => s.setupVault);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const handleSubmit = async e => {
    e.preventDefault();
    if (password.length < 12) {
      setValidationError('setup.error.tooShort');
      return;
    }
    if (password !== confirmPassword) {
      setValidationError('setup.error.mismatch');
      return;
    }
    setValidationError(null);
    await setupVault(password);
    setPassword('');
    setConfirmPassword('');
  };
  return /*#__PURE__*/React.createElement("section", {
    "aria-labelledby": "setup-heading",
    className: "ps-4 pe-4 pt-4 pb-4 text-start bg-zinc-950 text-zinc-50"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 mb-2"
  }, /*#__PURE__*/React.createElement(ShieldCheck, {
    className: "w-6 h-6 text-emerald-500",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("h1", {
    id: "setup-heading",
    className: "text-lg font-bold text-zinc-50"
  }, t('state.uninitialized.title'))), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-400 mb-4"
  }, t('state.uninitialized.subtitle')), /*#__PURE__*/React.createElement("form", {
    onSubmit: handleSubmit,
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "master-password-input"
  }, t('setup.masterPassword.label')), /*#__PURE__*/React.createElement("div", {
    className: "relative flex items-center"
  }, /*#__PURE__*/React.createElement(Input, {
    id: "master-password-input",
    type: showPassword ? 'text' : 'password',
    autoComplete: "new-password",
    value: password,
    onChange: e => setPassword(e.target.value),
    placeholder: t('setup.masterPassword.placeholder'),
    required: true
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": showPassword ? t('common.hidePassword') : t('common.showPassword'),
    onClick: () => setShowPassword(prev => !prev),
    className: "ms-2 ps-2 pe-2 pt-2 pb-2 rounded text-zinc-300 hover:text-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
  }, showPassword ? /*#__PURE__*/React.createElement(EyeOff, {
    className: "w-4 h-4",
    "aria-hidden": "true"
  }) : /*#__PURE__*/React.createElement(Eye, {
    className: "w-4 h-4",
    "aria-hidden": "true"
  })))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "confirm-password-input"
  }, t('setup.confirmPassword.label')), /*#__PURE__*/React.createElement(Input, {
    id: "confirm-password-input",
    type: showPassword ? 'text' : 'password',
    autoComplete: "new-password",
    value: confirmPassword,
    onChange: e => setConfirmPassword(e.target.value),
    placeholder: t('setup.confirmPassword.placeholder'),
    required: true
  })), validationError ? /*#__PURE__*/React.createElement("p", {
    role: "alert",
    className: "text-xs font-medium text-rose-500"
  }, t(validationError)) : null, /*#__PURE__*/React.createElement(Button, {
    type: "submit",
    variant: "emerald",
    className: "w-full mt-2"
  }, t('setup.create.button'))));
}