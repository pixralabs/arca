/**
 * @file apps/extension/src/options/biometrics.ts
 * @description WebAuthn Level 3 PRF Two-Step Biometric Enrollment & Assertion Ceremony
 * with 3-Strike Revocation Fallback (BIOMETRICS_SPEC.md v1.0).
 *
 * Security Invariants:
 * - Every async function starts with `await sodium.ready;` on its very first line.
 * - Executes enrollment in `options/index.html` tab so OS Touch ID / Windows Hello modals
 *   never close the extension popup mid-ceremony.
 * - Supports both single-step (`create` returns `prf.results.first`) and two-step
 *   (`create` returns `prf.enabled: true` -> `get` evaluates `prf.results.first`) authenticators.
 * - Enforces a strict 3-strike counter (`failedAttempts >= 3` deletes `biometric_slot` and forces Master Password).
 */

import sodium from 'libsodium-wrappers-sumo';
import { deriveBiometricKEK, sealBiometricSlot, unsealBiometricSlot } from '@vaultguard/crypto';
import { BIOMETRIC_MAX_STRIKES, DEK_BYTES, PRF_SALT_BYTES, VaultGuardError } from '@vaultguard/shared';
import { readBiometricSlot, writeBiometricSlot, deleteBiometricSlot } from '../vault/db.js';
/**
 * Runs the 2-step WebAuthn PRF enrollment ceremony (`navigator.credentials.create()` ->
 * `navigator.credentials.get()`) and stores the sealed `BiometricProtectedKeyEnvelope`
 * in IndexedDB `vault_meta`.
 */
export async function enrollBiometricUnlock(dek) {
  await sodium.ready;
  if (!(dek instanceof Uint8Array) || dek.byteLength !== DEK_BYTES) {
    throw new Error('BIOMETRIC_ENROLL_INVALID_DEK');
  }
  if (typeof navigator === 'undefined' || !navigator.credentials?.create) {
    throw new Error('BIOMETRIC_WEBAUTHN_UNSUPPORTED');
  }
  const prfSalt = sodium.randombytes_buf(PRF_SALT_BYTES);
  const challenge = sodium.randombytes_buf(32);
  const userId = sodium.randombytes_buf(32);
  let prfBytes = null;
  let biometricKek = null;
  try {
    // Step 1: Create Platform WebAuthn Credential with PRF extension requested
    const created = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'VaultGuard Local Vault'
        },
        user: {
          id: userId,
          name: 'vaultguard-local-user',
          displayName: 'VaultGuard Local Vault'
        },
        pubKeyCredParams: [{
          type: 'public-key',
          alg: -7
        },
        // ES256
        {
          type: 'public-key',
          alg: -257
        } // RS256
        ],

        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred'
        },
        timeout: 60000,
        extensions: {
          prf: {
            eval: {
              first: prfSalt
            }
          }
        }
      }
    });
    if (!created) {
      throw new Error('BIOMETRIC_CREDENTIAL_CREATION_CANCELLED');
    }
    const createExt = created.getClientExtensionResults();
    if (!createExt.prf?.enabled && !createExt.prf?.results?.first) {
      throw new Error('BIOMETRIC_PRF_EXTENSION_UNSUPPORTED');
    }
    const rawIdBytes = new Uint8Array(created.rawId);
    const credentialId = sodium.to_base64(rawIdBytes, sodium.base64_variants.ORIGINAL);
    if (createExt.prf?.results?.first) {
      prfBytes = new Uint8Array(createExt.prf.results.first.slice(0));
    } else {
      // Step 2: Evaluate PRF via navigator.credentials.get() for CTAP2 authenticators
      const verifyChallenge = sodium.randombytes_buf(32);
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: verifyChallenge,
          allowCredentials: [{
            type: 'public-key',
            id: rawIdBytes
          }],
          userVerification: 'required',
          timeout: 60000,
          extensions: {
            prf: {
              eval: {
                first: prfSalt
              }
            }
          }
        }
      });
      if (!assertion) {
        throw new Error('BIOMETRIC_PRF_ASSERTION_CANCELLED');
      }
      const getExt = assertion.getClientExtensionResults();
      if (!getExt.prf?.results?.first) {
        throw new Error('BIOMETRIC_PRF_EVALUATION_MISSING');
      }
      prfBytes = new Uint8Array(getExt.prf.results.first.slice(0));
    }
    biometricKek = await deriveBiometricKEK(prfBytes);
    const slot = await sealBiometricSlot(dek, biometricKek, credentialId, prfSalt);
    await writeBiometricSlot(slot);
    return slot;
  } finally {
    if (prfBytes) sodium.memzero(prfBytes);
    if (biometricKek) sodium.memzero(biometricKek);
  }
}

/**
 * Unlocks the vault DEK using the stored WebAuthn PRF `biometric_slot`.
 * Enforces the 3-strike rule: after 3 failed attempts, deletes `biometric_slot`
 * from IndexedDB and forces Master Password authentication.
 */
export async function unlockVaultWithBiometrics() {
  await sodium.ready;
  const slot = await readBiometricSlot();
  if (!slot || !slot.prfSalt) {
    throw new Error('BIOMETRIC_SLOT_NOT_ENROLLED');
  }
  if (slot.failedAttempts >= BIOMETRIC_MAX_STRIKES) {
    await deleteBiometricSlot();
    throw new VaultGuardError('ERR_WRONG_PASSWORD', {
      count: slot.failedAttempts,
      backoffSec: 4
    });
  }
  let prfBytes = null;
  let biometricKek = null;
  try {
    const rawCredentialId = sodium.from_base64(slot.credentialId, sodium.base64_variants.ORIGINAL);
    const challenge = sodium.randombytes_buf(32);
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{
          type: 'public-key',
          id: rawCredentialId
        }],
        userVerification: 'required',
        timeout: 60000,
        extensions: {
          prf: {
            eval: {
              first: slot.prfSalt
            }
          }
        }
      }
    });
    if (!assertion) {
      throw new Error('BIOMETRIC_ASSERTION_CANCELLED');
    }
    const ext = assertion.getClientExtensionResults();
    if (!ext.prf?.results?.first) {
      throw new Error('BIOMETRIC_PRF_OUTPUT_MISSING');
    }
    prfBytes = new Uint8Array(ext.prf.results.first.slice(0));
    biometricKek = await deriveBiometricKEK(prfBytes);
    const dek = await unsealBiometricSlot(slot, biometricKek);
    if (slot.failedAttempts > 0) {
      await writeBiometricSlot({
        ...slot,
        failedAttempts: 0
      });
    }
    return dek;
  } catch (err) {
    const nextStrikes = slot.failedAttempts + 1;
    if (nextStrikes >= BIOMETRIC_MAX_STRIKES) {
      await deleteBiometricSlot();
    } else {
      await writeBiometricSlot({
        ...slot,
        failedAttempts: nextStrikes
      });
    }
    if (err instanceof VaultGuardError) {
      throw err;
    }
    throw new VaultGuardError('ERR_WRONG_PASSWORD', {
      count: nextStrikes,
      backoffSec: Math.pow(2, nextStrikes - 1)
    });
  } finally {
    if (prfBytes) sodium.memzero(prfBytes);
    if (biometricKek) sodium.memzero(biometricKek);
  }
}