/**
 * @file packages/ui/src/hooks/useVaultState.ts
 * @description Formal 7-State Vault Lifecycle Hook (ARCHITECTURE.md v3.1 §2).
 */

import { useState, useCallback } from 'react';
const ALLOWED_TRANSITIONS = {
  UNINITIALIZED: ['UNLOCKING', 'LOCKED', 'CORRUPTED'],
  LOCKED: ['UNLOCKING', 'UNINITIALIZED', 'CORRUPTED', 'ROLLBACK_DETECTED'],
  UNLOCKING: ['UNLOCKED', 'EPHEMERAL_FALLBACK', 'LOCKED', 'CORRUPTED', 'ROLLBACK_DETECTED'],
  UNLOCKED: ['LOCKED', 'CORRUPTED', 'ROLLBACK_DETECTED'],
  EPHEMERAL_FALLBACK: ['LOCKED', 'CORRUPTED', 'ROLLBACK_DETECTED'],
  CORRUPTED: ['UNINITIALIZED'],
  ROLLBACK_DETECTED: ['LOCKED', 'UNINITIALIZED']
};
export function useVaultState(initialState = 'LOCKED') {
  const [state, setState] = useState(initialState);
  const [isEphemeralFallback, setIsEphemeralFallback] = useState(initialState === 'EPHEMERAL_FALLBACK');
  const [errorCode, setErrorCode] = useState(null);
  const transitionTo = useCallback((nextState, options) => {
    setState(current => {
      const allowed = ALLOWED_TRANSITIONS[current];
      if (!allowed.includes(nextState) && current !== nextState) {
        // Fail closed to LOCKED on unexpected state transition
        return 'LOCKED';
      }
      return nextState;
    });
    setIsEphemeralFallback(options?.isEphemeralFallback ?? nextState === 'EPHEMERAL_FALLBACK');
    setErrorCode(options?.errorCode ?? null);
  }, []);
  return {
    state,
    isEphemeralFallback,
    errorCode,
    transitionTo
  };
}