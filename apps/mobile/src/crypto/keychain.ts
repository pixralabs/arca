/**
 * @file apps/mobile/src/crypto/keychain.ts
 * @description Secure Hardware Keystore / Keyring interface for Arca Mobile.
 * Uses react-native-keychain with Hardware-backed Keystore / Secure Enclave.
 */

import * as Keychain from 'react-native-keychain';
import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics';

const rnBiometrics = new ReactNativeBiometrics();
const SERVICE_NAME = 'dev.pixra.arca.keystore';
const BIOMETRIC_SERVICE_NAME = 'dev.pixra.arca.biometrics';

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

export async function storeBiometricSlotKey(wrappedKeyHex: string): Promise<boolean> {
  try {
    const result = await Keychain.setGenericPassword('biometric_slot', wrappedKeyHex, {
      service: BIOMETRIC_SERVICE_NAME,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return Boolean(result);
  } catch {
    return false;
  }
}

export async function retrieveBiometricSlotKey(promptMessage = 'Unlock Arca Vault'): Promise<string | null> {
  try {
    const credentials = await Keychain.getGenericPassword({
      service: BIOMETRIC_SERVICE_NAME,
      authenticationPrompt: {
        title: promptMessage,
      },
    });
    if (credentials && credentials.password) {
      return credentials.password;
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearBiometricSlotKey(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: BIOMETRIC_SERVICE_NAME });
  } catch {
    // Ignore error on reset
  }
}
