function _extends() { _extends = Object.assign ? Object.assign.bind() : function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }
/**
 * @file packages/ui/src/primitives/index.tsx
 * @description Arca by Pixra — Premium Charcoal Accessible Primitives wrapping `@radix-ui/*` + `tailwindcss`
 * with Zinc 900/950 glassmorphic surfaces (`bg-zinc-950`, `bg-zinc-900/80`, `border-zinc-800`, `border-zinc-700/50`),
 * Emerald-500 primary CTAs, Amber-500 warnings/TOTP, and Rose-500 destructive actions.
 * Strictly uses Charcoal, Emerald, Amber, and Rose palette.
 */

import React, { forwardRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as ToastPrimitive from '@radix-ui/react-toast';
import * as LabelPrimitive from '@radix-ui/react-label';
import { X } from 'lucide-react';
export const Button = /*#__PURE__*/forwardRef(function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}, ref) {
  const variantClass = variant === 'primary' || variant === 'emerald' ? 'vg-btn-primary bg-emerald-500 text-zinc-950 font-semibold hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 border border-emerald-400/30' : variant === 'danger' ? 'vg-btn-danger bg-rose-500 text-zinc-50 font-semibold hover:bg-rose-400 border border-rose-400/40 shadow-lg shadow-rose-500/20' : variant === 'secondary' ? 'vg-btn-secondary bg-zinc-900/80 text-zinc-50 hover:bg-zinc-800 border border-zinc-700/50 backdrop-blur-md' : 'vg-btn-ghost bg-transparent text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-50';
  return /*#__PURE__*/React.createElement("button", _extends({
    ref: ref,
    type: props.type ?? 'button',
    className: `inline-flex items-center justify-center ps-3.5 pe-3.5 pt-2 pb-2 rounded-lg font-sans font-medium text-sm transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:opacity-50 ${variantClass} ${className}`.trim()
  }, props), children);
});
export const Input = /*#__PURE__*/forwardRef(function Input({
  className = '',
  ...props
}, ref) {
  return /*#__PURE__*/React.createElement("input", _extends({
    ref: ref,
    className: `w-full ps-3.5 pe-3.5 pt-2 pb-2 rounded-lg border border-zinc-800 bg-zinc-900/80 text-zinc-50 placeholder:text-zinc-400 text-start text-sm backdrop-blur-md shadow-inner focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${className}`.trim()
  }, props));
});
export const Label = /*#__PURE__*/forwardRef(function Label({
  className = '',
  ...props
}, ref) {
  return /*#__PURE__*/React.createElement(LabelPrimitive.Root, _extends({
    ref: ref,
    className: `block text-xs font-semibold tracking-tight text-zinc-300 mb-1 text-start ${className}`.trim()
  }, props));
});
export const DialogRoot = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogContent = /*#__PURE__*/forwardRef(function DialogContent({
  title,
  description,
  closeLabel,
  children,
  className = '',
  ...props
}, ref) {
  return /*#__PURE__*/React.createElement(DialogPrimitive.Portal, null, /*#__PURE__*/React.createElement(DialogPrimitive.Overlay, {
    className: "fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-40"
  }), /*#__PURE__*/React.createElement(DialogPrimitive.Content, _extends({
    ref: ref,
    className: `fixed z-50 inset-x-4 top-8 rounded-xl bg-zinc-900/80 backdrop-blur-md border border-zinc-800 ps-4 pe-4 pt-4 pb-4 text-start text-zinc-50 shadow-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 ${className}`.trim()
  }, props), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mb-2"
  }, /*#__PURE__*/React.createElement(DialogPrimitive.Title, {
    className: "text-base font-bold tracking-tight text-zinc-50 text-start"
  }, title), /*#__PURE__*/React.createElement(DialogPrimitive.Close, {
    "aria-label": closeLabel,
    className: "ps-1.5 pe-1.5 pt-1.5 pb-1.5 rounded-lg bg-zinc-800/80 text-zinc-300 hover:text-zinc-50 hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
  }, /*#__PURE__*/React.createElement(X, {
    className: "w-4 h-4",
    "aria-hidden": "true"
  }))), description ? /*#__PURE__*/React.createElement(DialogPrimitive.Description, {
    className: "text-xs text-zinc-400 mb-3 text-start leading-relaxed"
  }, description) : null, children));
});
export const TabsRoot = TabsPrimitive.Root;
export const TabsList = TabsPrimitive.List;
export const TabsTrigger = TabsPrimitive.Trigger;
export const TabsContent = TabsPrimitive.Content;
export const Switch = /*#__PURE__*/forwardRef(function Switch({
  className = '',
  ...props
}, ref) {
  return /*#__PURE__*/React.createElement(SwitchPrimitive.Root, _extends({
    ref: ref,
    className: `w-10 h-6 bg-zinc-800 border border-zinc-700/50 rounded-full relative data-[state=checked]:bg-emerald-500 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${className}`.trim()
  }, props), /*#__PURE__*/React.createElement(SwitchPrimitive.Thumb, {
    className: "block w-4 h-4 bg-zinc-50 rounded-full shadow transition-transform translate-x-1 data-[state=checked]:translate-x-5"
  }));
});
export const TooltipProvider = TooltipPrimitive.Provider;
export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export const TooltipContent = TooltipPrimitive.Content;
export const ToastProvider = ToastPrimitive.Provider;
export const ToastRoot = ToastPrimitive.Root;
export const ToastTitle = ToastPrimitive.Title;
export const ToastDescription = ToastPrimitive.Description;
export const ToastViewport = ToastPrimitive.Viewport;