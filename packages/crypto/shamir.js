/**
 * @vaultguard/crypto — 2-of-3 Shamir's Secret Sharing over GF(2^8) (`shamir.ts`)
 * Uses Cure53-audited `shamir-secret-sharing@0.0.4` to split and reconstruct
 * the 32-byte `recoveryEntropy` buffer.
 *
 * Security Invariants:
 * - Every async function starts with `await sodium.ready;` on its very first line.
 * - Enforces exact 32-byte `RECOVERY_ENTROPY_BYTES` input/output length.
 * - Zeroizes transient copies via `sodium.memzero()` in `finally`.
 */

import sodium from 'libsodium-wrappers-sumo';
import { split, combine } from 'shamir-secret-sharing';
import { RECOVERY_ENTROPY_BYTES, SHAMIR_TOTAL_SHARES, SHAMIR_THRESHOLD, VaultGuardError } from '@vaultguard/shared';

/**
 * Splits a 32-byte `recoveryEntropy` buffer into `3` shares with a reconstruction
 * threshold of `2` (`2-of-3` Shamir's Secret Sharing over GF(2^8)).
 */
export async function splitRecoveryEntropy(entropy) {
  await sodium.ready;
  if (!(entropy instanceof Uint8Array) || entropy.byteLength !== RECOVERY_ENTROPY_BYTES) {
    throw new Error('SHAMIR_INVALID_ENTROPY_LENGTH');
  }
  const workingCopy = new Uint8Array(entropy);
  try {
    const shares = await split(workingCopy, SHAMIR_TOTAL_SHARES, SHAMIR_THRESHOLD);
    if (!Array.isArray(shares) || shares.length !== SHAMIR_TOTAL_SHARES) {
      throw new Error('SHAMIR_SPLIT_FAILED');
    }
    return shares;
  } finally {
    sodium.memzero(workingCopy);
  }
}

/**
 * Reconstructs the 32-byte `recoveryEntropy` buffer from at least `2` distinct
 * Shamir shares (`Uint8Array[]`).
 */
export async function combineRecoveryShares(shares) {
  await sodium.ready;
  if (!Array.isArray(shares) || shares.length < SHAMIR_THRESHOLD) {
    throw new VaultGuardError('ERR_RECOVERY_INVALID');
  }
  const expectedShareLength = RECOVERY_ENTROPY_BYTES + 1;
  const seenIndices = new Set();
  for (const share of shares) {
    if (!(share instanceof Uint8Array) || share.byteLength !== expectedShareLength) {
      throw new VaultGuardError('ERR_RECOVERY_INVALID');
    }
    const shareIndex = share[share.byteLength - 1];
    if (seenIndices.has(shareIndex)) {
      throw new VaultGuardError('ERR_RECOVERY_INVALID');
    }
    seenIndices.add(shareIndex);
  }
  try {
    const reconstructed = await combine(shares);
    if (!(reconstructed instanceof Uint8Array) || reconstructed.byteLength !== RECOVERY_ENTROPY_BYTES) {
      throw new VaultGuardError('ERR_RECOVERY_INVALID');
    }
    return reconstructed;
  } catch (err) {
    if (err instanceof VaultGuardError) {
      throw err;
    }
    throw new VaultGuardError('ERR_RECOVERY_INVALID');
  }
}