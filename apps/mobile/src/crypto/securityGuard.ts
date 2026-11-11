/**
 * @file apps/mobile/src/crypto/securityGuard.ts
 * @description Anti-Tamper (Root/Jailbreak Detection via `jail-monkey` / `react-native-jail-monkey`)
 * and OS-Level Screen Capture Prevention (`WindowManager.LayoutParams.FLAG_SECURE`).
 */

import { NativeModules, Platform } from 'react-native';

export const SECURITY_COMPROMISED_WARNING =
  'Security compromised. Arca may not be safe on this device.';

const { ArcaSecurityModule, ArcaSplashScreen } = NativeModules;
const nativeSecurity = ArcaSecurityModule || ArcaSplashScreen;

function getJailMonkey(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jm = require('jail-monkey');
    return jm?.default ?? jm;
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const rnjm = require('react-native-jail-monkey');
      return rnjm?.default ?? rnjm;
    } catch {
      return null;
    }
  }
}

/**
 * Checks whether the current Android or iOS device is rooted, jailbroken, or hooked.
 * Uses `jail-monkey` (`isJailBroken()`, `hookDetected()`) and falls back to native OS checks.
 */
export function isDeviceCompromised(): boolean {
  try {
    const JailMonkey = getJailMonkey();
    if (JailMonkey) {
      if (typeof JailMonkey.isJailBroken === 'function' && JailMonkey.isJailBroken()) {
        return true;
      }
      if (typeof JailMonkey.hookDetected === 'function' && JailMonkey.hookDetected()) {
        return true;
      }
    }
    if (nativeSecurity && typeof nativeSecurity.isDeviceRootedSync === 'function') {
      return Boolean(nativeSecurity.isDeviceRootedSync());
    }
  } catch {
    // Fail-safe on missing native module in test environment
  }
  return false;
}

/**
 * Enables or disables `WindowManager.LayoutParams.FLAG_SECURE` on Android.
 * Prevents screenshots, screen recording, and Google Assistant/Recents screen snapshots
 * on sensitive screens (UnlockScreen, VaultScreen, and QR Scanner).
 */
export function setFlagSecure(enabled: boolean = true): void {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    if (nativeSecurity && typeof nativeSecurity.setFlagSecure === 'function') {
      nativeSecurity.setFlagSecure(enabled);
    }
  } catch {
    // Best-effort native call; MainActivity.kt also enforces FLAG_SECURE in onCreate()
  }
}
