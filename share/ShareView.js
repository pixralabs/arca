/**
 * @file apps/extension/src/share/ShareView.tsx
 * @description Arca by Pixra — Bot-Crawler-Safe Recipient Share View (`bg-zinc-950`, `bg-zinc-900/80`,
 * `border-zinc-800`, Emerald-500 primary actions, Amber-500 warnings, and 30-Second Clipboard Auto-Clear).
 * Strictly uses Charcoal, Emerald, Amber, and Rose palette.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { consumeEphemeralShare, burnEphemeralShare, parseShareUrlFragment } from '@vaultguard/crypto';
import { Button, I18nProvider, useI18n } from '@vaultguard/ui';
import { Zap, ShieldCheck, Eye, EyeOff, Copy } from 'lucide-react';
export const SHARE_CLIPBOARD_CLEAR_MS = 30_000;
export function detectExtensionInstalled() {
  const g = globalThis;
  return typeof g.chrome !== 'undefined' && Boolean(g.chrome?.runtime && (g.chrome.runtime.id || g.chrome.runtime.sendMessage));
}
function ShareRecipientInner() {
  const {
    t
  } = useI18n();
  const [revealed, setRevealed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [payload, setPayload] = useState(null);
  const [shareId, setShareId] = useState('');
  const [shareKeyBase64, setShareKeyBase64] = useState('');
  const [burned, setBurned] = useState(false);
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const clipboardClearTimerRef = useRef(null);
  const isExtensionPresent = detectExtensionInstalled();
  useEffect(() => {
    return () => {
      if (clipboardClearTimerRef.current !== null) {
        clearTimeout(clipboardClearTimerRef.current);
      }
    };
  }, []);
  const destroyShare = useCallback(async (id, keyB64) => {
    if (!id || !keyB64) return;
    await burnEphemeralShare(id, {
      shareKeyBase64: keyB64
    });
    setBurned(true);
    setPayload(null);
  }, []);
  const handleCopyWith30sAutoClear = useCallback(async secretText => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(secretText);
    }
    setToastMessage('Copied to clipboard. Will clear in 30 seconds.');
    if (clipboardClearTimerRef.current !== null) {
      clearTimeout(clipboardClearTimerRef.current);
    }
    clipboardClearTimerRef.current = setTimeout(async () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText('');
        }
      } catch {
        // Ignore if document lost focus during background clipboard scrub
      }
      setToastMessage('Clipboard cleared for security.');
    }, SHARE_CLIPBOARD_CLEAR_MS);
  }, []);
  const handleRevealShare = async () => {
    setRevealed(true);
    setError(null);
    try {
      const parsed = parseShareUrlFragment(window.location.href);
      const targetId = parsed.shareId ?? new URLSearchParams(window.location.search).get('id') ?? '';
      if (!targetId) {
        setError(t('share.recipient.burned'));
        return;
      }
      setShareId(targetId);
      setShareKeyBase64(parsed.shareKeyBase64);
      const item = await consumeEphemeralShare(targetId, parsed.shareKeyBase64, {
        burnAfterReading: true
      });
      setPayload(item);
    } catch {
      setError(t('share.recipient.burned'));
    }
  };
  const handleFillActiveTab = async () => {
    if (!payload) return;
    const g = globalThis;
    if (g.chrome?.runtime?.sendMessage) {
      await g.chrome.runtime.sendMessage({
        type: 'VAULT_AUTOFILL_ACTIVE_TAB',
        username: payload.username,
        password: payload.password,
        frameId: 0
      });
    }
    if (shareId && shareKeyBase64) {
      await destroyShare(shareId, shareKeyBase64);
    }
  };
  return /*#__PURE__*/React.createElement(motion.main, {
    initial: {
      opacity: 0,
      y: 10
    },
    animate: {
      opacity: 1,
      y: 0
    },
    transition: {
      duration: 0.2
    },
    className: "max-w-md mx-auto ps-6 pe-6 pt-8 pb-8 text-start bg-zinc-950 text-zinc-50 font-sans space-y-4"
  }, /*#__PURE__*/React.createElement("header", {
    className: "flex items-center gap-2.5 border-b border-zinc-800 pb-3"
  }, /*#__PURE__*/React.createElement(ShieldCheck, {
    className: "w-6 h-6 text-emerald-500",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("h1", {
    className: "text-base font-bold tracking-tight text-zinc-50"
  }, t('share.recipient.title'))), /*#__PURE__*/React.createElement(AnimatePresence, {
    mode: "wait"
  }, !revealed ? /*#__PURE__*/React.createElement(motion.section, {
    key: "reveal-gate",
    initial: {
      opacity: 0,
      y: 8
    },
    animate: {
      opacity: 1,
      y: 0
    },
    exit: {
      opacity: 0,
      y: -6
    },
    transition: {
      duration: 0.18
    },
    className: "ps-5 pe-5 pt-5 pb-5 rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md shadow-2xl space-y-4"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-semibold text-zinc-50"
  }, t('share.recipient.prompt')), /*#__PURE__*/React.createElement(Button, {
    variant: "emerald",
    className: "w-full",
    onClick: () => void handleRevealShare()
  }, /*#__PURE__*/React.createElement(Eye, {
    className: "w-4 h-4 me-1.5",
    "aria-hidden": "true"
  }), t('share.recipient.reveal'))) : null, revealed && (error || burned) ? /*#__PURE__*/React.createElement(motion.div, {
    key: "burned-notice",
    initial: {
      opacity: 0,
      y: 6
    },
    animate: {
      opacity: 1,
      y: 0
    },
    role: "status",
    className: "ps-4 pe-4 pt-4 pb-4 rounded-xl border border-rose-500/50 bg-zinc-900/90 backdrop-blur-md shadow-2xl text-xs text-rose-400"
  }, error ?? t('share.recipient.burned')) : null, revealed && payload && !burned ? /*#__PURE__*/React.createElement(motion.div, {
    key: "decrypted-card",
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
    className: "ps-5 pe-5 pt-5 pb-5 rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md shadow-2xl space-y-4"
  }, payload.title ? /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-bold tracking-tight text-zinc-50"
  }, payload.title) : null, /*#__PURE__*/React.createElement("div", {
    className: "space-y-1.5"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-semibold text-zinc-400"
  }, t('vault.item.username')), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-2 ps-3 pe-2 pt-2 pb-2 rounded-lg border border-zinc-800 bg-zinc-950/90"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-sm font-mono text-zinc-50 truncate"
  }, payload.username), /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "secondary",
    "aria-label": t('share.recipient.copyUsername'),
    onClick: () => void handleCopyWith30sAutoClear(payload.username),
    className: "ps-2.5 pe-2.5 pt-1 pb-1 text-xs shrink-0"
  }, /*#__PURE__*/React.createElement(Copy, {
    className: "w-3.5 h-3.5 me-1",
    "aria-hidden": "true"
  }), t('quickFill.copy.button')))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-1.5"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-semibold text-zinc-400"
  }, t('vault.item.password')), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-2 ps-3 pe-2 pt-2 pb-2 rounded-lg border border-zinc-800 bg-zinc-950/90"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-sm font-mono text-emerald-400 truncate"
  }, showPassword ? payload.password : '••••••••••••••••'), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1.5 shrink-0"
  }, /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "ghost",
    "aria-label": showPassword ? t('common.hidePassword') : t('common.showPassword'),
    onClick: () => setShowPassword(prev => !prev),
    className: "ps-2 pe-2 pt-1 pb-1"
  }, showPassword ? /*#__PURE__*/React.createElement(EyeOff, {
    className: "w-3.5 h-3.5",
    "aria-hidden": "true"
  }) : /*#__PURE__*/React.createElement(Eye, {
    className: "w-3.5 h-3.5",
    "aria-hidden": "true"
  })), /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "secondary",
    "aria-label": t('share.recipient.copyPassword'),
    onClick: () => void handleCopyWith30sAutoClear(payload.password),
    className: "ps-2.5 pe-2.5 pt-1 pb-1 text-xs"
  }, /*#__PURE__*/React.createElement(Copy, {
    className: "w-3.5 h-3.5 me-1",
    "aria-hidden": "true"
  }), t('quickFill.copy.button'))))), isExtensionPresent ? /*#__PURE__*/React.createElement(Button, {
    variant: "emerald",
    className: "w-full",
    onClick: () => void handleFillActiveTab()
  }, /*#__PURE__*/React.createElement(Zap, {
    className: "w-4 h-4 me-1.5",
    "aria-hidden": "true"
  }), t('share.recipient.fillActiveTab')) : null) : null), toastMessage ? /*#__PURE__*/React.createElement(motion.div, {
    initial: {
      opacity: 0,
      y: 4
    },
    animate: {
      opacity: 1,
      y: 0
    },
    role: "status",
    "aria-live": "polite",
    className: "ps-3.5 pe-3.5 pt-2.5 pb-2.5 rounded-lg border border-emerald-500/50 bg-zinc-900/90 backdrop-blur-md text-xs text-emerald-400 shadow-2xl"
  }, toastMessage) : null);
}
export function ShareView() {
  return /*#__PURE__*/React.createElement(I18nProvider, null, /*#__PURE__*/React.createElement(ShareRecipientInner, null));
}