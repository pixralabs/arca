/**
 * @file apps/extension/src/popup/views/GeneratorView.tsx
 * @description Arca by Pixra — CSPRNG Password & BIP39 Passphrase Generator UI (`bg-zinc-950`, `bg-zinc-900`, Emerald/Amber accents).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { generatePassword, generatePassphrase } from '@vaultguard/crypto';
import { Button, Label, Switch, useI18n } from '@vaultguard/ui';
import { RefreshCw, Copy } from 'lucide-react';
import { usePopupStore } from '../store.js';
export function GeneratorView() {
  const {
    t
  } = useI18n();
  const copyToClipboardWithAutoClear = usePopupStore(s => s.copyToClipboardWithAutoClear);
  const [mode, setMode] = useState('password');
  const [length, setLength] = useState(20);
  const [lowercase] = useState(true);
  const [uppercase, setUppercase] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);
  const [wordCount, setWordCount] = useState(6);
  const [capitalize, setCapitalize] = useState(true);
  const [includeNumber, setIncludeNumber] = useState(true);
  const [generated, setGenerated] = useState('');
  const regenerate = useCallback(async () => {
    if (mode === 'password') {
      const next = await generatePassword({
        length,
        lowercase,
        uppercase,
        digits,
        symbols,
        excludeAmbiguous
      });
      setGenerated(next);
    } else {
      const next = await generatePassphrase({
        wordCount,
        separator: '-',
        capitalize,
        includeNumber
      });
      setGenerated(next);
    }
  }, [mode, length, lowercase, uppercase, digits, symbols, excludeAmbiguous, wordCount, capitalize, includeNumber]);
  useEffect(() => {
    void regenerate();
  }, [regenerate]);
  return /*#__PURE__*/React.createElement("section", {
    "aria-labelledby": "generator-heading",
    className: "ps-4 pe-4 pt-3 pb-3 text-start bg-zinc-950 text-zinc-50 space-y-3"
  }, /*#__PURE__*/React.createElement("h1", {
    id: "generator-heading",
    className: "text-sm font-bold text-zinc-50"
  }, t('generator.title')), /*#__PURE__*/React.createElement("div", {
    role: "status",
    "aria-live": "polite",
    className: "ps-3 pe-3 pt-3 pb-3 rounded-lg border border-zinc-800 bg-zinc-900 font-mono text-sm text-emerald-400 break-all"
  }, generated), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    className: "flex-1",
    onClick: () => void regenerate()
  }, /*#__PURE__*/React.createElement(RefreshCw, {
    className: "w-4 h-4 me-1 text-amber-500",
    "aria-hidden": "true"
  }), t('generator.regenerate')), /*#__PURE__*/React.createElement(Button, {
    variant: "emerald",
    className: "flex-1",
    onClick: () => void copyToClipboardWithAutoClear(generated)
  }, /*#__PURE__*/React.createElement(Copy, {
    className: "w-4 h-4 me-1",
    "aria-hidden": "true"
  }), t('generator.copy'))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 pt-1"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: mode === 'password' ? 'emerald' : 'secondary',
    className: "flex-1",
    onClick: () => setMode('password')
  }, t('generator.mode.password')), /*#__PURE__*/React.createElement(Button, {
    variant: mode === 'passphrase' ? 'emerald' : 'secondary',
    className: "flex-1",
    onClick: () => setMode('passphrase')
  }, t('generator.mode.passphrase'))), mode === 'password' ? /*#__PURE__*/React.createElement("div", {
    className: "space-y-2 pt-1"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "pwd-length-range"
  }, t('generator.length', {
    length
  })), /*#__PURE__*/React.createElement("input", {
    id: "pwd-length-range",
    type: "range",
    min: 8,
    max: 128,
    value: length,
    onChange: e => setLength(Number(e.target.value)),
    className: "w-full accent-emerald-500"
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "sw-upper"
  }, t('generator.uppercase')), /*#__PURE__*/React.createElement(Switch, {
    id: "sw-upper",
    checked: uppercase,
    onCheckedChange: setUppercase
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "sw-digits"
  }, t('generator.digits')), /*#__PURE__*/React.createElement(Switch, {
    id: "sw-digits",
    checked: digits,
    onCheckedChange: setDigits
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "sw-symbols"
  }, t('generator.symbols')), /*#__PURE__*/React.createElement(Switch, {
    id: "sw-symbols",
    checked: symbols,
    onCheckedChange: setSymbols
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "sw-ambig"
  }, t('generator.excludeAmbiguous')), /*#__PURE__*/React.createElement(Switch, {
    id: "sw-ambig",
    checked: excludeAmbiguous,
    onCheckedChange: setExcludeAmbiguous
  }))) : /*#__PURE__*/React.createElement("div", {
    className: "space-y-2 pt-1"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "phrase-words-range"
  }, t('generator.words', {
    count: wordCount
  })), /*#__PURE__*/React.createElement("input", {
    id: "phrase-words-range",
    type: "range",
    min: 4,
    max: 12,
    value: wordCount,
    onChange: e => setWordCount(Number(e.target.value)),
    className: "w-full accent-emerald-500"
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "sw-cap"
  }, t('generator.capitalize')), /*#__PURE__*/React.createElement(Switch, {
    id: "sw-cap",
    checked: capitalize,
    onCheckedChange: setCapitalize
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "sw-num"
  }, t('generator.includeNumber')), /*#__PURE__*/React.createElement(Switch, {
    id: "sw-num",
    checked: includeNumber,
    onCheckedChange: setIncludeNumber
  }))));
}