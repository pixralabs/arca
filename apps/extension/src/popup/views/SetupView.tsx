/**
 * @file apps/extension/src/popup/views/SetupView.tsx
 * @description Arca by Pixra — Zero-Knowledge Vault Creation View (`bg-zinc-950`, `bg-zinc-900/80`, Emerald-500 CTA)
 * with real-time password strength meter, visibility toggle, and 1-click password generation.
 */

import React, { useState, useMemo } from 'react';
import { Button, Input, Label, useI18n } from '@vaultguard/ui';
import { ShieldCheck, Eye, EyeOff, Sparkles } from 'lucide-react';
import { generatePassword, auditPasswordStrength } from '@vaultguard/crypto';
import { usePopupStore } from '../store.js';

export function SetupView() {
  const { t } = useI18n();
  const setupVault = usePopupStore(s => s.setupVault);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const strengthAudit = useMemo(() => {
    if (!password) {
      return { score: 0, isWeak: true };
    }
    return auditPasswordStrength(password);
  }, [password]);

  const strengthColorClass = useMemo(() => {
    if (!password) return 'bg-transparent';
    if (strengthAudit.score >= 80) return 'bg-emerald-500';
    if (strengthAudit.score >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
  }, [password, strengthAudit.score]);

  const strengthTextColorClass = useMemo(() => {
    if (strengthAudit.score >= 80) return 'text-emerald-400';
    if (strengthAudit.score >= 50) return 'text-amber-400';
    return 'text-rose-400';
  }, [strengthAudit.score]);

  const strengthLabel = useMemo(() => {
    if (!password) return '';
    if (strengthAudit.score >= 80) return 'Strong';
    if (strengthAudit.score >= 50) return 'Fair';
    return 'Weak (min 12 chars)';
  }, [password, strengthAudit.score]);

  const handleGenerate = async () => {
    const generated = await generatePassword({ length: 24 });
    setPassword(generated);
    setConfirmPassword(generated);
    setShowPassword(true);
    setShowConfirmPassword(true);
    setValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
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

  return (
    <section aria-labelledby="setup-heading" className="p-4 text-start bg-zinc-950 text-zinc-50">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="w-6 h-6 text-emerald-500" aria-hidden="true" />
        <h1 id="setup-heading" className="text-lg font-bold text-zinc-50">
          {t('state.uninitialized.title')}
        </h1>
      </div>
      <p className="text-xs text-zinc-400 mb-4">
        {t('state.uninitialized.subtitle')}
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Master Password Input with Generate and Visibility Toggle */}
        <div>
          <Label htmlFor="master-password-input">
            {t('setup.masterPassword.label') || 'Master Password'}
          </Label>
          <div className="relative flex items-center gap-1.5 mt-1">
            <Input
              id="master-password-input"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter Master Password"
              required
              className="flex-1"
            />
            <button
              type="button"
              onClick={handleGenerate}
              className="flex items-center gap-1 px-2.5 py-2 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors shrink-0"
              title="Generate 24-character strong password"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Generate</span>
            </button>
            <button
              type="button"
              aria-label={showPassword ? t('common.hidePassword') : t('common.showPassword')}
              onClick={() => setShowPassword(prev => !prev)}
              className="p-2 rounded text-zinc-400 hover:text-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 shrink-0"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {password.length > 0 && (
            <div className="mt-1.5 space-y-1">
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${strengthColorClass}`}
                  style={{ width: `${Math.max(10, strengthAudit.score)}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className={`font-semibold ${strengthTextColorClass}`}>
                  {strengthLabel}
                </span>
                <span className="text-zinc-500 font-mono">{strengthAudit.score}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Confirm Password Input with Visibility Toggle */}
        <div>
          <Label htmlFor="confirm-password-input">
            {t('setup.confirmPassword.label') || 'Confirm Master Password'}
          </Label>
          <div className="relative flex items-center gap-1.5 mt-1">
            <Input
              id="confirm-password-input"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm Master Password"
              required
              className="flex-1"
            />
            <button
              type="button"
              aria-label={showConfirmPassword ? t('common.hidePassword') : t('common.showPassword')}
              onClick={() => setShowConfirmPassword(prev => !prev)}
              className="p-2 rounded text-zinc-400 hover:text-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 shrink-0"
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {confirmPassword.length > 0 && (
            <p
              className={`text-[11px] mt-1 font-medium ${
                password === confirmPassword ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {password === confirmPassword ? '✓ Passwords match' : '✕ Passwords do not match'}
            </p>
          )}
        </div>

        {validationError && (
          <p role="alert" className="text-xs font-medium text-rose-500">
            {t(validationError)}
          </p>
        )}

        <Button type="submit" variant="emerald" className="w-full mt-2">
          {t('setup.create.button')}
        </Button>
      </form>
    </section>
  );
}
