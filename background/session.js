/**
 * @file apps/extension/src/background/session.ts
 * @description MV3 Hybrid Ephemeral Session Engine & 7-State Vault Lifecycle Machine (ARCHITECTURE.md v3.1 §2-§3).
 *
 * Implements:
 * 1. `probeCryptoKeyPersistence()` — 3-step fast-fail probe (`< 150ms` budget, zero retries, zero ephemeral timers):
 *    - Step 1: `chrome.extension?.inIncognitoContext === true` -> fast-fail to `EPHEMERAL_FALLBACK`.
 *    - Step 2: `navigator.storage.estimate()` quota `< 64 MiB` -> fast-fail to `EPHEMERAL_FALLBACK` (Firefox Private / WebKit).
 *    - Step 3: Non-extractable AES-256-GCM `CryptoKey` IndexedDB write + read + 16-byte decrypt round-trip within 150ms.
 * 2. `restoreMutexPromise` — single-flight cold-start wake mutex preventing concurrent Service Worker restore races.
 * 3. `chrome.alarms` listeners (`VAULT_AUTO_LOCK`, `CLEAR_CLIPBOARD`) — persistent MV3 alarm scheduling.
 * 4. `purgeSessionStores()` — atomically zeroizes `activeDEK`, clears `chrome.storage.session`, and clears `session_keystore`.
 */

import sodium from 'libsodium-wrappers-sumo';
import { ALARM_AUTO_LOCK, ALARM_CLEAR_CLIPBOARD, AUTO_LOCK_DEFAULT_MINUTES, CLIPBOARD_CLEAR_DELAY_MINUTES, PRIVATE_MODE_QUOTA_THRESHOLD_BYTES, PROBE_TIMEOUT_MS } from '@vaultguard/shared';
import { clearSessionKeystore, getVaultDB, loadSessionWrappingKey, readVaultHeader, saveSessionWrappingKey, STORE_SESSION_KEYSTORE } from '../vault/db.js';
const SESSION_STORAGE_KEY = 'vg_wrapped_dek_v1';
let activeDEK = null;
let currentState = 'LOCKED';
let isEphemeralFallbackMode = false;
let autoLockMinutes = AUTO_LOCK_DEFAULT_MINUTES;
let restoreMutexPromise = null;

/**
 * 3-Step Fast-Fail Probe for Non-Extractable CryptoKey Persistence in IndexedDB.
 * Completes in < 150ms with zero retries and zero ephemeral timer calls.
 */
export async function probeCryptoKeyPersistence() {
  const startMs = performance.now();
  try {
    // Step 1: Immediate Incognito Context Detection
    const g = globalThis;
    if (g.chrome?.extension?.inIncognitoContext === true) {
      return false;
    }

    // Step 2: Storage Quota Heuristic (< 64 MiB indicates Private Browsing in Firefox / WebKit)
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      if (typeof estimate.quota === 'number' && estimate.quota > 0 && estimate.quota < PRIVATE_MODE_QUOTA_THRESHOLD_BYTES) {
        return false;
      }
    }
    if (performance.now() - startMs > PROBE_TIMEOUT_MS) {
      return false;
    }

    // Step 3: Non-Extractable AES-GCM CryptoKey Round-Trip Write + Read + 16-Byte Decrypt
    const probeKey = await crypto.subtle.generateKey({
      name: 'AES-GCM',
      length: 256
    }, false,
    // MUST be non-extractable
    ['encrypt', 'decrypt']);
    const probeIv = crypto.getRandomValues(new Uint8Array(12));
    const probePlaintext = crypto.getRandomValues(new Uint8Array(16));
    const probeCiphertext = await crypto.subtle.encrypt({
      name: 'AES-GCM',
      iv: probeIv
    }, probeKey, probePlaintext);
    const db = await getVaultDB();
    await db.put(STORE_SESSION_KEYSTORE, {
      id: '__probe_key__',
      key: probeKey,
      createdAt: Date.now()
    });
    const loadedRecord = await db.get(STORE_SESSION_KEYSTORE, '__probe_key__');
    await db.delete(STORE_SESSION_KEYSTORE, '__probe_key__');
    if (!loadedRecord || !loadedRecord.key || loadedRecord.key.extractable !== false) {
      return false;
    }
    const decryptedBuf = await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: probeIv
    }, loadedRecord.key, probeCiphertext);
    const decryptedBytes = new Uint8Array(decryptedBuf);
    if (decryptedBytes.byteLength !== 16) {
      return false;
    }
    for (let i = 0; i < 16; i++) {
      if (decryptedBytes[i] !== probePlaintext[i]) {
        return false;
      }
    }
    const elapsedMs = performance.now() - startMs;
    return elapsedMs <= PROBE_TIMEOUT_MS;
  } catch {
    return false;
  }
}

/**
 * Atomically purges all session key material across RAM, `chrome.storage.session`, and IndexedDB.
 */
export async function purgeSessionStores() {
  await sodium.ready;
  if (activeDEK) {
    sodium.memzero(activeDEK);
    activeDEK = null;
  }
  isEphemeralFallbackMode = false;
  try {
    const g = globalThis;
    if (g.chrome?.storage?.session) {
      await g.chrome.storage.session.clear();
    }
  } catch {
    // Ignore if session storage is unavailable
  }
  try {
    await clearSessionKeystore();
  } catch {
    // Ignore IDB clear failure during lock
  }
}

/**
 * Persists the unlocked 32-byte DEK using the Hybrid Split-Key architecture:
 * - Non-extractable AES-256-GCM `CryptoKey` in IndexedDB `session_keystore`
 * - AES-GCM wrapped DEK ciphertext in `chrome.storage.session`
 * Falls back cleanly to `EPHEMERAL_FALLBACK` (in-memory only) if `probeCryptoKeyPersistence()` fails.
 */
export async function establishUnlockedSession(dek) {
  await sodium.ready;
  if (activeDEK && activeDEK !== dek) {
    sodium.memzero(activeDEK);
  }
  activeDEK = new Uint8Array(dek);
  const canPersist = await probeCryptoKeyPersistence();
  if (!canPersist) {
    isEphemeralFallbackMode = true;
    currentState = 'EPHEMERAL_FALLBACK';
    await scheduleAutoLockAlarm();
    return currentState;
  }
  try {
    const wrappingKey = await crypto.subtle.generateKey({
      name: 'AES-GCM',
      length: 256
    }, false,
    // extractable: false
    ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertextBuf = await crypto.subtle.encrypt({
      name: 'AES-GCM',
      iv
    }, wrappingKey, activeDEK);
    await saveSessionWrappingKey(wrappingKey);
    const payload = {
      ivBase64: sodium.to_base64(iv, sodium.base64_variants.ORIGINAL),
      ciphertextBase64: sodium.to_base64(new Uint8Array(ciphertextBuf), sodium.base64_variants.ORIGINAL)
    };
    const g = globalThis;
    if (g.chrome?.storage?.session) {
      await g.chrome.storage.session.set({
        [SESSION_STORAGE_KEY]: payload
      });
    }
    isEphemeralFallbackMode = false;
    currentState = 'UNLOCKED';
  } catch {
    isEphemeralFallbackMode = true;
    currentState = 'EPHEMERAL_FALLBACK';
  }
  await scheduleAutoLockAlarm();
  return currentState;
}
async function performColdStartRestore() {
  await sodium.ready;
  if (activeDEK) {
    return activeDEK;
  }
  try {
    const g = globalThis;
    if (!g.chrome?.storage?.session) {
      return null;
    }
    const sessionData = await g.chrome.storage.session.get([SESSION_STORAGE_KEY]);
    const payload = sessionData[SESSION_STORAGE_KEY];
    if (!payload || typeof payload.ivBase64 !== 'string' || typeof payload.ciphertextBase64 !== 'string') {
      return null;
    }
    const wrappingKey = await loadSessionWrappingKey();
    if (!wrappingKey) {
      await purgeSessionStores();
      return null;
    }
    const iv = sodium.from_base64(payload.ivBase64, sodium.base64_variants.ORIGINAL);
    const ciphertext = sodium.from_base64(payload.ciphertextBase64, sodium.base64_variants.ORIGINAL);
    const decryptedBuf = await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv
    }, wrappingKey, ciphertext);
    activeDEK = new Uint8Array(decryptedBuf);
    currentState = 'UNLOCKED';
    return activeDEK;
  } catch {
    await purgeSessionStores();
    currentState = 'LOCKED';
    return null;
  }
}

/**
 * Single-flight cold-start wake restoration guarded by `restoreMutexPromise`.
 */
export async function getOrRestoreActiveDEK() {
  if (activeDEK) {
    await scheduleAutoLockAlarm();
    return activeDEK;
  }
  if (!restoreMutexPromise) {
    restoreMutexPromise = performColdStartRestore().finally(() => {
      restoreMutexPromise = null;
    });
  }
  return restoreMutexPromise;
}
export async function getVaultLifecycleState() {
  if (currentState === 'CORRUPTED' || currentState === 'ROLLBACK_DETECTED') {
    return {
      state: currentState,
      isEphemeralFallback: isEphemeralFallbackMode,
      autoLockMinutes
    };
  }
  const header = await readVaultHeader();
  if (!header) {
    currentState = 'UNINITIALIZED';
    return {
      state: 'UNINITIALIZED',
      isEphemeralFallback: false,
      autoLockMinutes
    };
  }
  const dek = await getOrRestoreActiveDEK();
  if (dek) {
    currentState = isEphemeralFallbackMode ? 'EPHEMERAL_FALLBACK' : 'UNLOCKED';
  } else {
    currentState = 'LOCKED';
  }
  return {
    state: currentState,
    isEphemeralFallback: isEphemeralFallbackMode,
    autoLockMinutes
  };
}
export function setVaultErrorState(state) {
  currentState = state;
}
export async function lockVault() {
  await purgeSessionStores();
  const header = await readVaultHeader();
  currentState = header ? 'LOCKED' : 'UNINITIALIZED';
}
export async function setAutoLockTimeoutMinutes(minutes) {
  if (Number.isSafeInteger(minutes) && minutes >= 1 && minutes <= 60) {
    autoLockMinutes = minutes;
    await scheduleAutoLockAlarm();
  }
}
export async function scheduleAutoLockAlarm() {
  const g = globalThis;
  if (g.chrome?.alarms) {
    await g.chrome.alarms.clear(ALARM_AUTO_LOCK);
    await g.chrome.alarms.create(ALARM_AUTO_LOCK, {
      delayInMinutes: autoLockMinutes
    });
  }
}
export async function scheduleClipboardClearAlarm() {
  const g = globalThis;
  if (g.chrome?.alarms) {
    await g.chrome.alarms.clear(ALARM_CLEAR_CLIPBOARD);
    await g.chrome.alarms.create(ALARM_CLEAR_CLIPBOARD, {
      delayInMinutes: CLIPBOARD_CLEAR_DELAY_MINUTES
    });
  }
}
export function registerBackgroundAlarmListeners(onClearClipboard) {
  const g = globalThis;
  if (g.chrome?.alarms?.onAlarm) {
    g.chrome.alarms.onAlarm.addListener(alarm => {
      if (alarm.name === ALARM_AUTO_LOCK) {
        void lockVault();
      } else if (alarm.name === ALARM_CLEAR_CLIPBOARD) {
        void onClearClipboard();
      }
    });
  }
}