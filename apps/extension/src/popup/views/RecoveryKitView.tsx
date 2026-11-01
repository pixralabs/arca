/**
 * @file apps/extension/src/popup/views/RecoveryKitView.tsx
 * @description Arca by Pixra — 24-Word BIP39 Recovery Kit Display & Mandatory 3-Word Verification Quiz (#4, #12, #21).
 */

import React, { useState, useMemo } from 'react';
import { Button, Input, Label, useI18n } from '@vaultguard/ui';
import { KeyRound } from 'lucide-react';
import { usePopupStore } from '../store.js';
const QUIZ_WORD_INDICES = [4, 12, 21];
export function RecoveryKitView() {
  const {
    t
  } = useI18n();
  const mnemonic = usePopupStore(s => s.pendingRecoveryMnemonic) ?? '';
  const clearPendingRecoveryMnemonic = usePopupStore(s => s.clearPendingRecoveryMnemonic);
  const words = useMemo(() => mnemonic.trim().split(/\s+/), [mnemonic]);
  const [answers, setAnswers] = useState({
    4: '',
    12: '',
    21: ''
  });
  const [quizError, setQuizError] = useState(false);
  const handleVerify = e => {
    e.preventDefault();
    for (const idx of QUIZ_WORD_INDICES) {
      const expected = (words[idx - 1] ?? '').toLowerCase();
      const actual = (answers[idx] ?? '').trim().toLowerCase();
      if (!expected || actual !== expected) {
        setQuizError(true);
        return;
      }
    }
    setQuizError(false);
    clearPendingRecoveryMnemonic();
  };
  return /*#__PURE__*/React.createElement("section", {
    "aria-labelledby": "recovery-heading",
    className: "ps-4 pe-4 pt-4 pb-4 text-start bg-zinc-950 text-zinc-50"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 mb-2"
  }, /*#__PURE__*/React.createElement(KeyRound, {
    className: "w-5 h-5 text-amber-500",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("h1", {
    id: "recovery-heading",
    className: "text-base font-bold text-zinc-50"
  }, t('recovery.title'))), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-400 mb-3"
  }, t('recovery.subtitle')), /*#__PURE__*/React.createElement("ol", {
    "aria-label": t('recovery.title'),
    className: "grid grid-cols-3 gap-1.5 ps-3 pe-3 pt-2 pb-2 mb-4 rounded-lg border border-zinc-800 bg-zinc-900 text-xs font-mono"
  }, words.map((word, index) => /*#__PURE__*/React.createElement("li", {
    key: index,
    className: "ps-1 pe-1 pt-0.5 pb-0.5 text-zinc-200"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-amber-500 me-1"
  }, index + 1, "."), /*#__PURE__*/React.createElement("span", null, word)))), /*#__PURE__*/React.createElement("form", {
    onSubmit: handleVerify,
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-xs font-bold text-zinc-300"
  }, t('recovery.quiz.title')), QUIZ_WORD_INDICES.map(wordNum => /*#__PURE__*/React.createElement("div", {
    key: wordNum
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: `quiz-word-${String(wordNum)}`
  }, t('recovery.quiz.prompt', {
    index: wordNum
  })), /*#__PURE__*/React.createElement(Input, {
    id: `quiz-word-${String(wordNum)}`,
    type: "text",
    autoComplete: "off",
    value: answers[wordNum] ?? '',
    onChange: e => setAnswers(prev => ({
      ...prev,
      [wordNum]: e.target.value
    })),
    required: true
  }))), quizError ? /*#__PURE__*/React.createElement("p", {
    role: "alert",
    className: "text-xs font-medium text-rose-500"
  }, t('recovery.quiz.error')) : null, /*#__PURE__*/React.createElement(Button, {
    type: "submit",
    variant: "emerald",
    className: "w-full mt-2"
  }, t('recovery.quiz.confirm'))));
}