/**
 * @vaultguard/crypto — RFC 6238 TOTP (2FA) Generator (`totp.ts`)
 * Locked to TOTP_SPEC.md v1.1 & ARCHITECTURE.md v4.3:
 * - Every async function starts with `await sodium.ready;` on its very first line.
 * - Uses audited zero-dependency `otpauth@9.3.4` (`OTPAuth.TOTP`, `OTPAuth.Secret`).
 * - Decodes Base32 into a transient `Uint8Array` buffer and wipes it via `sodium.memzero()`
 *   inside a `finally` block immediately after generating the 6/8-digit code.
 * - Implements Smart Next-Window Lookahead when `remainingSeconds <= 2`.
 */

import sodium from 'libsodium-wrappers-sumo';
import * as OTPAuth from 'otpauth';
import { parseOtpauthUri, validateTotpConfig, TotpConfig } from '@vaultguard/shared';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Decodes an RFC 4648 Base32 secret string into a raw `Uint8Array` buffer.
 */
export function decodeBase32ToBytes(base32Secret: string): Uint8Array {
  const cleaned = base32Secret.replace(/[\s=-]+/g, '').toUpperCase();
  if (cleaned.length < 16) {
    throw new Error('ERR_TOTP_INVALID_SECRET');
  }
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i] ?? '');
    if (idx === -1) {
      throw new Error('ERR_TOTP_INVALID_SECRET');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

export function formatTotpCode(code: string): string {
  if (code.length === 6) {
    return `${code.slice(0, 3)} ${code.slice(3)}`;
  }
  if (code.length === 8) {
    return `${code.slice(0, 4)} ${code.slice(4)}`;
  }
  return code;
}

export interface TotpResult {
  code: string;
  formattedCode: string;
  remainingSeconds: number;
  period: number;
  usedNextWindow: boolean;
}

/**
 * Generates an RFC 6238 TOTP code from a `TotpConfig` or `otpauth://` URI string.
 * Starts with `await sodium.ready;` and wipes the decoded Base32 secret buffer
 * via `sodium.memzero()` in `finally`.
 */
export async function generateTotpCode(
  input: string | TotpConfig,
  timestampMs: number = Date.now(),
  enableNextWindowLookahead: boolean = true
): Promise<TotpResult> {
  await sodium.ready;
  const config = typeof input === 'string' ? parseOtpauthUri(input) : input;
  const validation = validateTotpConfig(config);
  if (!validation.valid) {
    throw new Error('ERR_TOTP_INVALID_CONFIG');
  }

  const secretBytes = decodeBase32ToBytes(config.secret);
  try {
    const period = config.period;
    const nowSec = Math.floor(timestampMs / 1000);
    const elapsedSec = ((nowSec % period) + period) % period;
    const remainingSeconds = period - elapsedSec;
    const usedNextWindow = enableNextWindowLookahead && remainingSeconds <= 2;
    const effectiveTimestampMs = usedNextWindow ? timestampMs + remainingSeconds * 1000 : timestampMs;

    const secretCopy = secretBytes.slice(0);
    const otpSecret = new OTPAuth.Secret({
      buffer: secretCopy.buffer,
    });

    const totp = new OTPAuth.TOTP({
      issuer: config.issuer ?? 'VaultGuard',
      algorithm: config.algorithm,
      digits: config.digits,
      period: config.period,
      secret: otpSecret,
    });

    const code = totp.generate({
      timestamp: effectiveTimestampMs,
    });

    sodium.memzero(secretCopy);
    return {
      code,
      formattedCode: formatTotpCode(code),
      remainingSeconds,
      period,
      usedNextWindow,
    };
  } finally {
    sodium.memzero(secretBytes);
  }
}
