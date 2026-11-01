/**
 * @file apps/extension/src/popup/views/TotpBadge.tsx
 * @description Arca by Pixra — Live 6/8-Digit RFC 6238 TOTP Display with 30-Second SVG Circular Countdown Ring.
 * Uses Amber-500 (Gold Key) for the countdown ring and transitions to Rose-500 (Red Key) when < 5s.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { generateTotpCode } from '@vaultguard/crypto';
import { Button, useI18n } from '@vaultguard/ui';
import { Copy } from 'lucide-react';
const CIRCLE_RADIUS = 8;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;
export function TotpBadge({
  totpInput,
  onCopyCode
}) {
  const {
    t
  } = useI18n();
  const [code, setCode] = useState('');
  const [formattedCode, setFormattedCode] = useState('••• •••');
  const [remainingSeconds, setRemainingSeconds] = useState(30);
  const [period, setPeriod] = useState(30);
  const refreshTotp = useCallback(async () => {
    try {
      const result = await generateTotpCode(totpInput, Date.now(), true);
      setCode(result.code);
      setFormattedCode(result.formattedCode);
      setRemainingSeconds(result.remainingSeconds);
      setPeriod(result.period);
    } catch {
      setCode('');
      setFormattedCode('--- ---');
    }
  }, [totpInput]);
  useEffect(() => {
    void refreshTotp();
    const intervalId = window.setInterval(() => {
      void refreshTotp();
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [refreshTotp]);
  if (!code) {
    return null;
  }
  const progressFraction = Math.max(0, Math.min(1, remainingSeconds / period));
  const strokeDashoffset = CIRCLE_CIRCUMFERENCE * (1 - progressFraction);
  // Step 3 Requirement: Countdown ring uses Amber-500 (Gold) and transitions to Rose-500 (Red) when < 5s
  const ringColorClass = remainingSeconds < 5 ? 'text-rose-500' : 'text-amber-500';
  return /*#__PURE__*/React.createElement(motion.div, {
    initial: {
      opacity: 0,
      scale: 0.98
    },
    animate: {
      opacity: 1,
      scale: remainingSeconds < 5 ? [1, 1.03, 1] : 1
    },
    transition: {
      duration: 0.35
    },
    className: "inline-flex items-center gap-2 ps-2.5 pe-2.5 pt-1 pb-1 rounded-lg border border-zinc-800 bg-zinc-950/90 backdrop-blur-md shadow-lg"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 20 20",
    "aria-hidden": "true",
    className: `-rotate-90 ${ringColorClass}`
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "10",
    cy: "10",
    r: CIRCLE_RADIUS,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    className: "opacity-20"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "10",
    cy: "10",
    r: CIRCLE_RADIUS,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeDasharray: CIRCLE_CIRCUMFERENCE,
    strokeDashoffset: strokeDashoffset,
    strokeLinecap: "round"
  })), /*#__PURE__*/React.createElement("span", {
    role: "timer",
    "aria-live": "off",
    className: `font-mono tabular-nums text-xs font-bold tracking-wider ${ringColorClass}`
  }, formattedCode), /*#__PURE__*/React.createElement("span", {
    className: "text-xs text-zinc-400 font-mono tabular-nums"
  }, remainingSeconds, "s"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    "aria-label": t('totp.copy.button'),
    onClick: () => void onCopyCode(code),
    className: "ps-1.5 pe-1.5 pt-1 pb-1"
  }, /*#__PURE__*/React.createElement(Copy, {
    className: "w-3 h-3 text-zinc-300",
    "aria-hidden": "true"
  })));
}