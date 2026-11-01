/**
 * @file apps/extension/src/content/formObserver.ts
 * @description Zero-DOM-Mutation Login Form Observer for Dual-Path Auto-Save (UI_UX_SPEC.md v1.1 §2.1).
 *
 * Captures `(username, password)` during capture-phase `submit`, button `pointerdown`,
 * and `Enter` `keydown` events on login forms and dispatches `CANDIDATE_LOGIN_SUBMITTED`
 * to the MV3 Background Service Worker while transient user activation is active.
 */

import { isInputSafeAndUnoccluded } from './fillGuard.js';
/**
 * Extracts a visible, unoccluded `(username, password)` pair from a `<form>` or document scope.
 */
export function extractLoginCandidateFromScope(scopeRoot) {
  const passwordInputs = Array.from(scopeRoot.querySelectorAll('input[type="password"]:not([disabled]):not([readonly])'));
  for (const pwdInput of passwordInputs) {
    const password = pwdInput.value;
    if (!password || password.length === 0) continue;
    if (!isInputSafeAndUnoccluded(pwdInput)) continue;
    const searchContainer = pwdInput.form ?? scopeRoot;
    const userInputs = Array.from(searchContainer.querySelectorAll('input[type="email"]:not([disabled]):not([readonly]), input[autocomplete="username"]:not([disabled]):not([readonly]), input[type="text"]:not([disabled]):not([readonly])'));
    let username = '';
    for (const userInput of userInputs) {
      if (userInput !== pwdInput && userInput.value.trim().length > 0 && isInputSafeAndUnoccluded(userInput)) {
        username = userInput.value.trim();
        break;
      }
    }
    return {
      username,
      password
    };
  }
  return null;
}
function dispatchCandidateToBackground(candidate) {
  const g = globalThis;
  if (g.chrome?.runtime?.sendMessage) {
    void g.chrome.runtime.sendMessage({
      type: 'CANDIDATE_LOGIN_SUBMITTED',
      username: candidate.username,
      password: candidate.password
    });
  }
}

/**
 * Attaches capture-phase listeners (`submit`, `pointerdown`, `keydown`) to detect login
 * submissions across both traditional MPA forms and SPA (`fetch`) login flows.
 */
export function registerLoginFormObserver() {
  if (typeof document === 'undefined') return;

  // 1. Capture-phase form submit listener
  document.addEventListener('submit', event => {
    const form = event.target instanceof HTMLFormElement ? event.target : document;
    const candidate = extractLoginCandidateFromScope(form);
    if (candidate) {
      dispatchCandidateToBackground(candidate);
    }
  }, {
    capture: true,
    passive: true
  });

  // 2. Capture-phase Enter keydown inside a password input (SPA login support)
  document.addEventListener('keydown', event => {
    if (!event.isTrusted || event.key !== 'Enter') return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'password') return;
    const candidate = extractLoginCandidateFromScope(target.form ?? document);
    if (candidate) {
      dispatchCandidateToBackground(candidate);
    }
  }, {
    capture: true,
    passive: true
  });

  // 3. Capture-phase pointerdown on submit buttons when a password field is populated
  document.addEventListener('pointerdown', event => {
    if (!event.isTrusted) return;
    const el = event.target instanceof HTMLElement ? event.target.closest('button, input[type="submit"]') : null;
    if (!el) return;
    const formScope = el instanceof HTMLButtonElement || el instanceof HTMLInputElement ? el.form ?? document : document;
    const candidate = extractLoginCandidateFromScope(formScope);
    if (candidate) {
      dispatchCandidateToBackground(candidate);
    }
  }, {
    capture: true,
    passive: true
  });
}