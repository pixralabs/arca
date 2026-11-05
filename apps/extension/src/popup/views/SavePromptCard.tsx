/**
 * @file apps/extension/src/popup/views/SavePromptCard.tsx
 * @description Arca by Pixra — Pinned Top-of-Popup Save / Update Credential Banner (`bg-zinc-900`, `border-emerald-500/40`)
 * with Seamless "Save Existing" Flow & Weak/Reused Warning Prompt.
 */

import React, { useEffect, useCallback, useState } from 'react';
import { Button, useI18n } from '@vaultguard/ui';
import { ShieldPlus, ShieldAlert, Sparkles, X, Check } from 'lucide-react';
import { generatePassword } from '@vaultguard/crypto';

export interface SavePromptCardProps {
  candidate: any;
  onConfirmSave: (cand: any) => Promise<void>;
  onDismiss: (cand: any) => void;
}

export function SavePromptCard({
  candidate,
  onConfirmSave,
  onDismiss,
}: SavePromptCardProps) {
  const { t } = useI18n();
  const [activePassword, setActivePassword] = useState<string>(candidate.password || '');
  const [isReplacedWithGenerator, setIsReplacedWithGenerator] = useState<boolean>(false);
  const [replacing, setReplacing] = useState<boolean>(false);

  const handleReplaceWithGenerator = async () => {
    setReplacing(true);
    try {
      const strongPw = await generatePassword({ length: 20 });
      setActivePassword(strongPw);
      setIsReplacedWithGenerator(true);
    } catch {
      // Fallback
    } finally {
      setReplacing(false);
    }
  };

  const handleConfirm = async () => {
    await onConfirmSave({
      ...candidate,
      password: activePassword,
    });
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        void onDismiss(candidate);
      }
    },
    [candidate, activePassword, onDismiss]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const hasWarning = Boolean(candidate.warningMessage && !isReplacedWithGenerator);

  return (
    <section
      role="region"
      aria-labelledby="save-prompt-heading"
      className={`ps-3 pe-3 pt-3 pb-3 border-b text-zinc-50 text-start space-y-2.5 transition-colors ${
        hasWarning
          ? 'bg-amber-950/40 border-amber-500/50'
          : 'bg-zinc-900/95 border-emerald-500/40'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {hasWarning ? (
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          ) : (
            <ShieldPlus className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" />
          )}
          <h2 id="save-prompt-heading" className={`text-xs font-bold ${hasWarning ? 'text-amber-400' : 'text-emerald-400'}`}>
            {candidate.isUpdate
              ? t('savePrompt.title.update')
              : 'Save this existing password to Arca?'}
          </h2>
        </div>
        <button
          type="button"
          aria-label={t('savePrompt.dismiss.button')}
          onClick={() => void onDismiss(candidate)}
          className="ps-1 pe-1 pt-1 pb-1 rounded text-zinc-400 hover:text-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      <p className="text-xs text-zinc-300">
        {candidate.domain} ({candidate.username})
      </p>

      {/* Warning Prompt (Requirement 3: Warning: This password is weak and used on 3 other sites) */}
      {hasWarning ? (
        <div
          role="alert"
          className="ps-2.5 pe-2.5 pt-1.5 pb-1.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-xs font-medium text-amber-300 space-y-1.5"
        >
          <p>{candidate.warningMessage}</p>
          <Button
            type="button"
            variant="secondary"
            className="w-full text-xs py-1 border-amber-500/40 hover:bg-amber-500/20 text-amber-200"
            disabled={replacing}
            onClick={() => void handleReplaceWithGenerator()}
          >
            <Sparkles className="w-3.5 h-3.5 me-1 text-amber-400" aria-hidden="true" />
            Replace with Arca Generator
          </Button>
        </div>
      ) : null}

      {isReplacedWithGenerator ? (
        <div className="ps-2.5 pe-2.5 pt-1.5 pb-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-xs font-medium text-emerald-300 flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
          <span>Replaced with high-entropy 20-character generator password!</span>
        </div>
      ) : null}

      <div className="flex items-center gap-2 pt-0.5">
        <Button
          variant="emerald"
          className="flex-1"
          onClick={() => void handleConfirm()}
        >
          {isReplacedWithGenerator
            ? 'Save Strong Password'
            : hasWarning
            ? 'Save to Arca Anyway'
            : candidate.isUpdate
            ? t('savePrompt.update.button')
            : t('savePrompt.save.button')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void onDismiss(candidate)}
        >
          {t('savePrompt.dismiss.button')}
        </Button>
      </div>
    </section>
  );
}
