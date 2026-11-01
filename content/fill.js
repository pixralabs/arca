/**
 * @file apps/extension/src/content/fill.ts
 * @description Zero-DOM-Injection User-Gesture Credential Filler.
 *
 * Security Invariants (ARCHITECTURE.md v3.1 §5):
 * - Zero DOM node creation or injection into the host page.
 * - Zero automatic form submission.
 * - Calls `isInputSafeAndUnoccluded(input)` immediately before populating each field.
 * - Uses native `HTMLInputElement.prototype.value` setter and dispatches `input` + `change` events.
 */

import { isInputSafeAndUnoccluded } from './fillGuard.js';
/**
 * Sets an `<input>` value using the native HTMLInputElement prototype descriptor
 * after verifying `isInputSafeAndUnoccluded(input)`.
 */
export function fillCredentialIntoInput(input, value) {
  if (!isInputSafeAndUnoccluded(input)) {
    return false;
  }
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  if (!descriptor || typeof descriptor.set !== 'function') {
    return false;
  }
  descriptor.set.call(input, value);
  input.dispatchEvent(new Event('input', {
    bubbles: true
  }));
  input.dispatchEvent(new Event('change', {
    bubbles: true
  }));
  return true;
}

/**
 * Locates visible, unoccluded username and password inputs on the current page
 * and fills them without triggering form submission.
 */
export function autofillPageCredentials(payload) {
  const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]:not([disabled]):not([readonly])'));
  let filledCount = 0;
  let blockedByOcclusion = false;
  for (const pwdInput of passwordInputs) {
    if (!isInputSafeAndUnoccluded(pwdInput)) {
      blockedByOcclusion = true;
      continue;
    }

    // Look for a preceding username/email input within the same form or document
    const scopeRoot = pwdInput.form ?? document;
    const candidateUserInputs = Array.from(scopeRoot.querySelectorAll('input[type="text"]:not([disabled]):not([readonly]), input[type="email"]:not([disabled]):not([readonly]), input[autocomplete="username"]:not([disabled]):not([readonly])'));
    for (const userInput of candidateUserInputs) {
      if (userInput !== pwdInput && isInputSafeAndUnoccluded(userInput)) {
        if (fillCredentialIntoInput(userInput, payload.username)) {
          filledCount++;
          break;
        }
      }
    }
    if (fillCredentialIntoInput(pwdInput, payload.password)) {
      filledCount++;
    }
  }
  return {
    ok: filledCount > 0 && !blockedByOcclusion,
    filledCount,
    blockedByOcclusion
  };
}