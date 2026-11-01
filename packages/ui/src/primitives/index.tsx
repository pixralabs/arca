/**
 * @file packages/ui/src/primitives/index.tsx
 * @description Arca by Pixra — Premium Charcoal Accessible Primitives wrapping `@radix-ui/*` + `tailwindcss`
 * with Zinc 900/950 glassmorphic surfaces (`bg-zinc-950`, `bg-zinc-900/80`, `border-zinc-800`, `border-zinc-700/50`),
 * Emerald-500 primary CTAs, Amber-500 warnings/TOTP, and Rose-500 destructive actions.
 * Strictly uses Charcoal, Emerald, Amber, and Rose palette.
 */

import React, { forwardRef, ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as ToastPrimitive from '@radix-ui/react-toast';
import * as LabelPrimitive from '@radix-ui/react-label';
import { X } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'emerald' | 'secondary' | 'danger' | 'ghost';
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className = '', children, ...props },
  ref
) {
  const variantClass =
    variant === 'primary' || variant === 'emerald'
      ? 'vg-btn-primary bg-emerald-500 text-zinc-950 font-semibold hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 border border-emerald-400/30'
      : variant === 'danger'
      ? 'vg-btn-danger bg-rose-500 text-zinc-50 font-semibold hover:bg-rose-400 border border-rose-400/40 shadow-lg shadow-rose-500/20'
      : variant === 'secondary'
      ? 'vg-btn-secondary bg-zinc-900/80 text-zinc-50 hover:bg-zinc-800 border border-zinc-700/50 backdrop-blur-md'
      : 'vg-btn-ghost bg-transparent text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-50';

  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      className={`inline-flex items-center justify-center ps-3.5 pe-3.5 pt-2 pb-2 rounded-lg font-sans font-medium text-sm transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:opacity-50 ${variantClass} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full ps-3.5 pe-3.5 pt-2 pb-2 rounded-lg border border-zinc-800 bg-zinc-900/80 text-zinc-50 placeholder:text-zinc-400 text-start text-sm backdrop-blur-md shadow-inner focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${className}`.trim()}
        {...props}
      />
    );
  }
);

export const Label = forwardRef<HTMLLabelElement, React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(
  function Label({ className = '', ...props }, ref) {
    return (
      <LabelPrimitive.Root
        ref={ref}
        className={`block text-xs font-semibold tracking-tight text-zinc-300 mb-1 text-start ${className}`.trim()}
        {...props}
      />
    );
  }
);

export const DialogRoot = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export interface DialogContentProps extends Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  closeLabel?: string;
  children?: ReactNode;
}

export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  function DialogContent(
    { title, description, closeLabel = 'Close', children, className = '', ...props },
    ref
  ) {
    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-40" />
        <DialogPrimitive.Content
          ref={ref}
          className={`fixed z-50 inset-x-4 top-8 rounded-xl bg-zinc-900/80 backdrop-blur-md border border-zinc-800 ps-4 pe-4 pt-4 pb-4 text-start text-zinc-50 shadow-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 ${className}`.trim()}
          {...props}
        >
          <div className="flex items-center justify-between mb-2">
            <DialogPrimitive.Title className="text-base font-bold tracking-tight text-zinc-50 text-start">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={closeLabel}
              className="ps-1.5 pe-1.5 pt-1.5 pb-1.5 rounded-lg bg-zinc-800/80 text-zinc-300 hover:text-zinc-50 hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          {description ? (
            <DialogPrimitive.Description className="text-xs text-zinc-400 mb-3 text-start leading-relaxed">
              {description}
            </DialogPrimitive.Description>
          ) : null}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  }
);

export const TabsRoot = TabsPrimitive.Root;
export const TabsList = TabsPrimitive.List;
export const TabsTrigger = TabsPrimitive.Trigger;
export const TabsContent = TabsPrimitive.Content;

export const Switch = forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>>(
  function Switch({ className = '', ...props }, ref) {
    return (
      <SwitchPrimitive.Root
        ref={ref}
        className={`w-10 h-6 bg-zinc-800 border border-zinc-700/50 rounded-full relative data-[state=checked]:bg-emerald-500 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${className}`.trim()}
        {...props}
      >
        <SwitchPrimitive.Thumb className="block w-4 h-4 bg-zinc-50 rounded-full shadow transition-transform translate-x-1 data-[state=checked]:translate-x-5" />
      </SwitchPrimitive.Root>
    );
  }
);

export const TooltipProvider = TooltipPrimitive.Provider;
export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export const TooltipContent = TooltipPrimitive.Content;

export const ToastProvider = ToastPrimitive.Provider;
export const ToastRoot = ToastPrimitive.Root;
export const ToastTitle = ToastPrimitive.Title;
