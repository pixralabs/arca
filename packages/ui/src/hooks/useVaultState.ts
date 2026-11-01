/**
 * @file packages/ui/src/hooks/useVaultState.ts
 * @description Formal 7-State Vault Lifecycle Hook (ARCHITECTURE.md v3.1 §2).
 */

import { useState, useCallback } from 'react';

export type VaultLifecycleState =
  | 'UNINITIALIZED'
  | 'LOCKED'
  | 'UNLOCKING'
  | 'UNLOCKED'
  | 'EPHEMERAL_FALLBACK'
  | 'CORRUPTED'
  | 'ROLLBACK_DETECTED';

const ALLOWED_TRANSITIONS: Record<VaultLifecycleState, VaultLifecycleState[]> = {
  UNINITIALIZED: ['UNLOCKING', 'LOCKED', 'CORRUPTED'],
  LOCKED: ['UNLOCKING', 'UNINITIALIZED', 'CORRUPTED', 'ROLLBACK_DETECTED'],
  UNLOCKING: ['UNLOCKED', 'EPHEMERAL_FALLBACK', 'LOCKED', 'CORRUPTED', 'ROLLBACK_DETECTED'],
  UNLOCKED: ['LOCKED', 'CORRUPTED', 'ROLLBACK_DETECTED'],
  EPHEMERAL_FALLBACK: ['LOCKED', 'CORRUPTED', 'ROLLBACK_DETECTED'],
  CORRUPTED: ['UNINITIALIZED'],
  ROLLBACK_DETECTED: ['LOCKED', 'UNINITIALIZED'],
};

export interface UseVaultStateOptions {
  isEphemeralFallback?: boolean;
  errorCode?: string | null;
}

export function useVaultState(initialState: VaultLifecycleState = 'LOCKED') {
  const [state, setState] = useState<VaultLifecycleState>(initialState);
  const [isEphemeralFallback, setIsEphemeralFallback] = useState(
    initialState === 'EPHEMERAL_FALLBACK'
  );
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const transitionTo = useCallback(
    (nextState: VaultLifecycleState, options?: UseVaultStateOptions) => {
      setState(current => {
        const allowed = ALLOWED_TRANSITIONS[current] ?? [];
        if (!allowed.includes(nextState) && current !== nextState) {
          // Fail closed to LOCKED on unexpected state transition
          return 'LOCKED';
        }
        return nextState;
      });
      setIsEphemeralFallback(
        options?.isEphemeralFallback ?? nextState === 'EPHEMERAL_FALLBACK'
      );
      setErrorCode(options?.errorCode ?? null);
    },
    []
  );

  return {
    state,
    isEphemeralFallback,
    errorCode,
    transitionTo,
  };
}
