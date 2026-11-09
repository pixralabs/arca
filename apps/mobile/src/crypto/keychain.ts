/**
 * @file apps/mobile/src/crypto/keychain.ts
 * @description Secure Hardware Keystore / Keyring interface for Arca Mobile.
 * Uses react-native-keychain with Hardware-backed Keystore / Secure Enclave.
 * Fully isolates master credentials per vault ID.
 */

import * as Keychain from 'react-native-keychain';
import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics';

const rnBiometrics = new ReactNativeBiometrics();
const BIOMETRIC_SERVICE_BASE = 'com.pixra.arca.biometrics';

function getServiceForVault(vaultId?: string): string {
  if (!vaultId || vaultId === 'default' || vaultId === 'default_vault') {
    return BIOMETRIC_SERVICE_BASE;
  }
  return `${BIOMETRIC_SERVICE_BASE}.${vaultId}`;
}

export async function checkBiometricsAvailable(): Promise<{
  available: boolean;
  biometryType: string | null;
}> {
  try {
    const { available, biometryType } = await rnBiometrics.isSensorAvailable();
    return {
      available,
      biometryType:
        biometryType === BiometryTypes.TouchID
          ? 'TouchID'
          : biometryType === BiometryTypes.FaceID
          ? 'FaceID'
          : biometryType === BiometryTypes.Biometrics
          ? 'Biometrics'
          : null,
    };
  } catch {
    return { available: false, biometryType: null };
  }
}

export async function storeBiometricSlotKey(
  wrappedKeyHex: string,
  vaultId?: string
): Promise<boolean> {
  try {
    const service = getServiceForVault(vaultId);
    const result = await Keychain.setGenericPassword('biometric_slot', wrappedKeyHex, {
      service,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return Boolean(result);
  } catch {
    return false;
  }
}

export async function retrieveBiometricSlotKey(
  promptMessage = 'Unlock Arca Vault',
  vaultId?: string
): Promise<string | null> {
  try {
    const service = getServiceForVault(vaultId);
    const credentials = await Keychain.getGenericPassword({
      service,
      authenticationPrompt: {
        title: promptMessage,
      },
    });
    if (credentials && credentials.password) {
      return credentials.password;
    }
    // Fallback check on base service for legacy migration
    if (service !== BIOMETRIC_SERVICE_BASE) {
      const fallback = await Keychain.getGenericPassword({
        service: BIOMETRIC_SERVICE_BASE,
        authenticationPrompt: {
          title: promptMessage,
        },
      });
      if (fallback && fallback.password) {
        return fallback.password;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function hasBiometricSlotKey(vaultId?: string): Promise<boolean> {
  try {
    const service = getServiceForVault(vaultId);
    const services = await Keychain.getAllGenericPasswordServices();
    if (services && services.includes(service)) return true;
    if (service !== BIOMETRIC_SERVICE_BASE && services && services.includes(BIOMETRIC_SERVICE_BASE)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function clearBiometricSlotKey(vaultId?: string): Promise<void> {
  try {
    const service = getServiceForVault(vaultId);
    await Keychain.resetGenericPassword({ service });
    if (service !== BIOMETRIC_SERVICE_BASE) {
      await Keychain.resetGenericPassword({ service: BIOMETRIC_SERVICE_BASE });
    }
  } catch {
    // Ignore error on reset
  }
}
