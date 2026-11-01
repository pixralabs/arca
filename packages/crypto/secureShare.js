/**
 * @vaultguard/crypto — Milestone 2D (`v0.3.5-share` / Patch VG-04 `v0.4.1`) Bot-Crawler-Safe One-Time Ephemeral Sharing (`secureShare.ts`)
 *
 * Security Architecture (Patch VG-04):
 * - Every async function starts with `await sodium.ready;` on its very first line.
 * - Sender generates a random 256-bit `shareKey = sodium.randombytes_buf(32)`.
 * - Derives a one-way cryptographic `burnToken` from `shareKey` via keyed BLAKE2b-256
 *   (`deriveShareBurnToken(shareKey)` over domain string `"VG_SHARE_BURN_TOKEN_V1"`).
 * - The item payload (`username`, `password`, `url`, optional `title`) is padded to 256 bytes
 *   (`padTo256`) and encrypted with `shareKey` using `XChaCha20-Poly1305-IETF` (`24`-byte nonce,
 *   canonical AAD `"vaultguard:v1:share:<shareId>"`).
 * - The ciphertext and `burnToken` are uploaded to `POST /v1/share/create` (`maxViews = 1`, `expiresAt = now + 1h`).
 *   The server NEVER receives `shareKey`.
 * - Patch VG-04: The share link formats both `shareId` and `shareKeyBase64` inside the URL fragment:
 *   `https://share.vaultguard.dev/#<shareId>:<shareKeyBase64>`
 * - Bot-Crawler & Unauthenticated Burn Protection:
 *   - `GET /v1/share/:id` returns the ciphertext ONLY if `view_count < max_views` without incrementing `view_count`.
 *   - `POST /v1/share/:id/burn` requires `burnToken` (derived from `shareKey`) and verifies it on the server
 *     before incrementing `view_count` and deleting the share row.
 * - All transient key and plaintext buffers (`shareKey`, `padded`, `plaintextBytes`) are wiped
 *   via `sodium.memzero()` inside `finally` blocks.
 */

import sodium from 'libsodium-wrappers-sumo';
import { DEK_BYTES, AEAD_NONCE_BYTES, AEAD_TAG_BYTES } from '@vaultguard/shared';
import { padTo256, unpadFrom256 } from './padding.js';
export const DEFAULT_SHARE_BASE_URL = 'https://share.vaultguard.dev';
export const DEFAULT_SHARE_RELAY_URL = 'https://sync.vaultguard.dev';
export const DEFAULT_SHARE_TTL_MS = 3_600_000; // 1 hour (3,600,000 ms)
export const AAD_SHARE_PREFIX = 'vaultguard:v1:share:';
export const SHARE_BURN_TOKEN_CONTEXT = 'VG_SHARE_BURN_TOKEN_V1';
// Local ephemeral fallback store when no remote HTTP transport is injected
const inMemoryShareRelayStore = new Map();
export function buildShareAad(shareId) {
  if (typeof shareId !== 'string' || shareId.trim().length === 0) {
    throw new Error('ERR_SHARE_INVALID_ID');
  }
  return `${AAD_SHARE_PREFIX}${shareId.trim()}`;
}

/**
 * Patch VG-04: Derives a deterministic, one-way 64-hex-character `burnToken` from the 32-byte `shareKey`
 * using keyed BLAKE2b-256 (`sodium.crypto_generichash(32, "VG_SHARE_BURN_TOKEN_V1", shareKey)`).
 * Starts with `await sodium.ready;` on line 1 and wipes `workingKey` in `finally`.
 */
export async function deriveShareBurnToken(shareKey) {
  await sodium.ready;
  if (!(shareKey instanceof Uint8Array) || shareKey.byteLength !== DEK_BYTES) {
    throw new Error('ERR_SHARE_INVALID_KEY_LENGTH');
  }
  const workingKey = new Uint8Array(shareKey);
  try {
    const contextBytes = sodium.from_string(SHARE_BURN_TOKEN_CONTEXT);
    const tokenBytes = sodium.crypto_generichash(32, contextBytes, workingKey);
    const tokenHex = sodium.to_hex(tokenBytes);
    sodium.memzero(tokenBytes);
    return tokenHex;
  } finally {
    sodium.memzero(workingKey);
  }
}

/**
 * Extracts `shareId` and `shareKeyBase64` from `https://share.vaultguard.dev/#<shareId>:<shareKeyBase64>`.
 */
export function parseShareUrlFragment(urlOrHash) {
  if (typeof urlOrHash !== 'string' || urlOrHash.trim().length === 0) {
    throw new Error('ERR_SHARE_EMPTY_FRAGMENT');
  }
  const trimmed = urlOrHash.trim();
  let hashPart = trimmed;
  let queryShareId;
  if (trimmed.includes('#')) {
    const hashIdx = trimmed.indexOf('#');
    hashPart = trimmed.slice(hashIdx + 1);
    try {
      const parsedUrl = new URL(trimmed.slice(0, hashIdx));
      const idParam = parsedUrl.searchParams.get('id');
      if (idParam) {
        queryShareId = idParam;
      }
    } catch {
      // Fragment-only string
    }
  } else if (trimmed.startsWith('#')) {
    hashPart = trimmed.slice(1);
  }
  if (hashPart.includes(':')) {
    const [prefixId, keyPart] = hashPart.split(':', 2);
    if (prefixId && keyPart) {
      return {
        shareId: prefixId,
        shareKeyBase64: keyPart
      };
    }
  }
  if (!hashPart) {
    throw new Error('ERR_SHARE_EMPTY_FRAGMENT');
  }
  return {
    shareKeyBase64: hashPart,
    shareId: queryShareId
  };
}

/**
 * Encrypts an `EphemeralSharePayload` into a single Base64 blob `(24B nonce || 256B-padded XChaCha20-Poly1305 ciphertext)`
 * under the 32-byte `shareKey`.
 * Starts with `await sodium.ready;` on line 1 and wipes `workingKey`, `plaintextBytes`, and `padded` in `finally`.
 */
export async function encryptSharePayload(itemPayload, shareKey, shareId) {
  await sodium.ready;
  if (!(shareKey instanceof Uint8Array) || shareKey.byteLength !== DEK_BYTES) {
    throw new Error('ERR_SHARE_INVALID_KEY_LENGTH');
  }
  if (typeof itemPayload !== 'object' || itemPayload === null) {
    throw new Error('ERR_SHARE_INVALID_PAYLOAD');
  }
  const workingKey = new Uint8Array(shareKey);
  const plaintextBytes = sodium.from_string(JSON.stringify(itemPayload));
  const padded = padTo256(plaintextBytes);
  const nonce = sodium.randombytes_buf(AEAD_NONCE_BYTES);
  const aadBytes = sodium.from_string(buildShareAad(shareId));
  try {
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(padded, aadBytes, null, nonce, workingKey);
    const combined = new Uint8Array(nonce.byteLength + ciphertext.byteLength);
    combined.set(nonce, 0);
    combined.set(ciphertext, nonce.byteLength);
    return sodium.to_base64(combined, sodium.base64_variants.ORIGINAL);
  } finally {
    sodium.memzero(workingKey);
    sodium.memzero(plaintextBytes);
    sodium.memzero(padded);
  }
}

/**
 * Decrypts and unpads a Base64 `(24B nonce || ciphertext)` ephemeral share blob in RAM.
 * Starts with `await sodium.ready;` on line 1 and wipes `workingKey` and `padded` in `finally`.
 */
export async function decryptSharePayload(encryptedPayloadBase64, shareKey, shareId) {
  await sodium.ready;
  if (!(shareKey instanceof Uint8Array) || shareKey.byteLength !== DEK_BYTES) {
    throw new Error('ERR_SHARE_INVALID_KEY_LENGTH');
  }
  if (typeof encryptedPayloadBase64 !== 'string' || encryptedPayloadBase64.trim().length === 0) {
    throw new Error('ERR_SHARE_EMPTY_CIPHERTEXT');
  }
  const combined = sodium.from_base64(encryptedPayloadBase64.trim(), sodium.base64_variants.ORIGINAL);
  if (combined.byteLength < AEAD_NONCE_BYTES + 256 + AEAD_TAG_BYTES) {
    throw new Error('ERR_SHARE_CORRUPTED_CIPHERTEXT');
  }
  const nonce = combined.slice(0, AEAD_NONCE_BYTES);
  const ciphertext = combined.slice(AEAD_NONCE_BYTES);
  const aadBytes = sodium.from_string(buildShareAad(shareId));
  const workingKey = new Uint8Array(shareKey);
  let padded = null;
  let unpadded = null;
  try {
    padded = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ciphertext, aadBytes, nonce, workingKey);
    unpadded = unpadFrom256(padded);
    const jsonStr = sodium.to_string(unpadded);
    return JSON.parse(jsonStr);
  } catch {
    throw new Error('ERR_SHARE_DECRYPTION_FAILED');
  } finally {
    sodium.memzero(workingKey);
    if (padded) {
      sodium.memzero(padded);
    }
    if (unpadded) {
      sodium.memzero(unpadded);
    }
  }
}

/**
 * Patch VG-04: Generates a fresh 256-bit `shareKey`, derives `burnToken` from `shareKey`,
 * encrypts `itemPayload` with XChaCha20-Poly1305-IETF, uploads `{ shareId, encryptedPayload, burnToken }`
 * to `POST /v1/share/create` (`maxViews = 1`, `expiresAt = now + 1h`), and formats the URL as:
 * `https://share.vaultguard.dev/#<shareId>:<shareKeyBase64>`.
 * Starts with `await sodium.ready;` on line 1 and zeroizes `shareKey` via `sodium.memzero()` in `finally`.
 */
export async function createEphemeralShare(itemPayload, options = {}) {
  await sodium.ready;
  if (typeof itemPayload !== 'object' || itemPayload === null) {
    throw new Error('ERR_SHARE_INVALID_PAYLOAD');
  }
  const shareKey = sodium.randombytes_buf(DEK_BYTES);
  try {
    const shareId = options.shareId ?? crypto.randomUUID();
    const ttlMs = options.ttlMs ?? DEFAULT_SHARE_TTL_MS;
    const nowMs = Date.now();
    const defaultExpiresAt = nowMs + ttlMs;
    const shareKeyBase64 = sodium.to_base64(shareKey, sodium.base64_variants.URLSAFE_NO_PADDING);
    const burnToken = await deriveShareBurnToken(shareKey);
    const encryptedPayload = await encryptSharePayload(itemPayload, shareKey, shareId);
    let finalShareId = shareId;
    let finalExpiresAt = defaultExpiresAt;
    if (options.transport) {
      const relayBase = (options.relayServerUrl ?? DEFAULT_SHARE_RELAY_URL).replace(/\/+$/, '');
      const res = await options.transport({
        method: 'POST',
        url: `${relayBase}/v1/share/create`,
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          shareId,
          encryptedPayload,
          burnToken,
          ttlMs,
          maxViews: 1
        })
      });
      if (!res.ok) {
        throw new Error(`ERR_SHARE_CREATE_FAILED_${String(res.status)}`);
      }
      const parsed = JSON.parse(res.bodyText);
      if (typeof parsed.shareId === 'string' && parsed.shareId.length > 0) {
        finalShareId = parsed.shareId;
      }
      if (typeof parsed.expiresAt === 'number') {
        finalExpiresAt = parsed.expiresAt;
      }
    } else {
      inMemoryShareRelayStore.set(finalShareId, {
        encryptedPayload,
        burnToken,
        expiresAt: finalExpiresAt,
        viewCount: 0,
        maxViews: 1
      });
    }
    const baseUrl = (options.shareBaseUrl ?? DEFAULT_SHARE_BASE_URL).replace(/\/+$/, '');
    // Patch VG-04: Always format share URL as https://share.vaultguard.dev/#<shareId>:<shareKeyBase64>
    const url = `${baseUrl}/#${finalShareId}:${shareKeyBase64}`;
    return {
      shareId: finalShareId,
      shareKeyBase64,
      burnToken,
      url,
      encryptedPayload,
      expiresAt: finalExpiresAt
    };
  } finally {
    sodium.memzero(shareKey);
  }
}

/**
 * Patch VG-04: Explicitly increments `view_count` and destroys an ephemeral share on the relay server
 * via `POST /v1/share/:id/burn` authenticated with `burnToken` (derived from `shareKey`).
 * Starts with `await sodium.ready;` on line 1.
 */
export async function burnEphemeralShare(shareId, options = {}) {
  await sodium.ready;
  const trimmedId = shareId.trim();
  if (!trimmedId) {
    throw new Error('ERR_SHARE_INVALID_ID');
  }
  let resolvedBurnToken = options.burnToken?.trim() ?? '';
  if (!resolvedBurnToken && options.shareKeyBase64) {
    const shareKey = sodium.from_base64(options.shareKeyBase64.trim(), sodium.base64_variants.URLSAFE_NO_PADDING);
    try {
      resolvedBurnToken = await deriveShareBurnToken(shareKey);
    } finally {
      sodium.memzero(shareKey);
    }
  }
  if (!resolvedBurnToken) {
    throw new Error('ERR_SHARE_MISSING_BURN_TOKEN');
  }
  const entry = inMemoryShareRelayStore.get(trimmedId);
  if (entry) {
    if (entry.burnToken !== resolvedBurnToken) {
      throw new Error('ERR_SHARE_INVALID_BURN_TOKEN');
    }
    entry.viewCount += 1;
    inMemoryShareRelayStore.delete(trimmedId);
  }
  if (options.transport) {
    const relayBase = (options.relayServerUrl ?? DEFAULT_SHARE_RELAY_URL).replace(/\/+$/, '');
    const res = await options.transport({
      method: 'POST',
      url: `${relayBase}/v1/share/${encodeURIComponent(trimmedId)}/burn`,
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        burnToken: resolvedBurnToken
      })
    });
    return res.ok;
  }
  return true;
}

/**
 * Bot-Crawler-Safe Ephemeral Share Consumer (Patch VG-04):
 * 1. Fetches the ciphertext via `GET /v1/share/:id` (which does NOT increment `view_count` on `GET`).
 * 2. Decrypts the payload in RAM using `shareKeyBase64` from the URL fragment.
 * 3. Derives `burnToken` from `shareKey` and explicitly calls `POST /v1/share/:id/burn` (`burnEphemeralShare`)
 *    to increment `view_count` and destroy the payload on the server.
 * 4. Zeroizes `shareKey` via `sodium.memzero()` in `finally`.
 * Starts with `await sodium.ready;` on line 1.
 */
export async function consumeEphemeralShare(shareId, shareKeyBase64, options = {}) {
  await sodium.ready;
  const trimmedId = shareId.trim();
  if (!trimmedId) {
    throw new Error('ERR_SHARE_INVALID_ID');
  }
  if (typeof shareKeyBase64 !== 'string' || shareKeyBase64.trim().length === 0) {
    throw new Error('ERR_SHARE_INVALID_KEY');
  }
  const shareKey = sodium.from_base64(shareKeyBase64.trim(), sodium.base64_variants.URLSAFE_NO_PADDING);
  try {
    let encryptedPayload = options.encryptedPayloadOverride;
    if (!encryptedPayload) {
      if (options.transport) {
        const relayBase = (options.relayServerUrl ?? DEFAULT_SHARE_RELAY_URL).replace(/\/+$/, '');
        const res = await options.transport({
          method: 'GET',
          url: `${relayBase}/v1/share/${encodeURIComponent(trimmedId)}`,
          headers: {}
        });
        if (!res.ok) {
          throw new Error('ERR_SHARE_EXPIRED_OR_CONSUMED');
        }
        const parsed = JSON.parse(res.bodyText);
        encryptedPayload = parsed.encryptedPayload;
      } else {
        const entry = inMemoryShareRelayStore.get(trimmedId);
        const nowMs = Date.now();
        if (!entry || nowMs >= entry.expiresAt || entry.viewCount >= entry.maxViews) {
          inMemoryShareRelayStore.delete(trimmedId);
          throw new Error('ERR_SHARE_EXPIRED_OR_CONSUMED');
        }
        encryptedPayload = entry.encryptedPayload;
      }
    }
    const decrypted = await decryptSharePayload(encryptedPayload, shareKey, trimmedId);
    if (options.burnAfterReading !== false) {
      const burnToken = await deriveShareBurnToken(shareKey);
      await burnEphemeralShare(trimmedId, {
        burnToken,
        relayServerUrl: options.relayServerUrl,
        transport: options.transport
      });
    }
    return decrypted;
  } finally {
    sodium.memzero(shareKey);
  }
}