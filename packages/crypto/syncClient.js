/**
 * @vaultguard/crypto — Zero-Knowledge Blind Relay HTTP Client & HLC LWW-Element-Set CRDT (`syncClient.ts`)
 * Locked to SYNC_PROTOCOL.md v1.0, ARCHITECTURE.md v4.4 & Patch VG-03 (v0.4.1):
 * - The extension's manifest allows connection to the sync server (`connect-src 'self' https://sync.vaultguard.dev`)
 *   to comply with MV3 static CSP rules, but the runtime code enforces a strict zero-network guarantee
 *   unless the user explicitly enables Sync (`if (!syncEnabled) { throw new Error('Sync is disabled'); }` on line 1).
 * - Every async function calls `await sodium.ready;` before any `sodium.*` call.
 * - Enforces 256-byte padded DataEnvelope invariant (`(ciphertext.byteLength - 16) % 256 === 0`)
 *   before any item blob is serialized for transmission.
 * - Patch VG-03: `registerSyncAccount` signs `accountId` and `accountAuthPubKey` with the `VG_AUT_1`
 *   Ed25519 private key and includes `registrationSignature` in `POST /v1/auth/register`.
 * - Executes Ed25519 Challenge-Response Authentication (`VG_SYNC_AUTH_V1:`) over
 *   `/v1/auth/challenge`, `/v1/auth/verify`, `/v1/sync/delta`,
 *   `/v1/sync/push` (with optimistic CAS on `expectedVaultSeq`), and `DELETE /v1/account`.
 */

import sodium from 'libsodium-wrappers-sumo';
import { AEAD_NONCE_BYTES, AEAD_TAG_BYTES, PAD_BLOCK_BYTES } from '@vaultguard/shared';
import { signSyncRegistration, signSyncChallenge, EMPTY_BODY_SHA256 } from './syncAuth.js';
export const DEFAULT_SYNC_SERVER_URL = 'https://sync.vaultguard.dev';
export const DEFAULT_CSP_EXTENSION_PAGES = "script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; connect-src 'self' https://sync.vaultguard.dev; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
/**
 * Validates and normalizes the Blind Relay Server URL.
 * Permits `https://` origins (or `http://localhost` / `http://127.0.0.1` for local dev).
 */
export function validateSyncServerUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    throw new Error('ERR_SYNC_INVALID_SERVER_URL');
  }
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('ERR_SYNC_INVALID_SERVER_URL');
  }
  const isLocalhostHttp = parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  if (parsed.protocol !== 'https:' && !isLocalhostHttp) {
    throw new Error('ERR_SYNC_INSECURE_SERVER_URL');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('ERR_SYNC_INVALID_SERVER_URL');
  }
  return parsed.origin;
}

/**
 * Returns the static MV3 `content_security_policy.extension_pages` directive.
 * Chrome MV3 parses CSP at install time (`connect-src 'self' https://sync.vaultguard.dev`);
 * runtime code enforces the strict zero-network guarantee when `syncEnabled === false`.
 */
export function buildSyncContentSecurityPolicy(_syncEnabled = false, _serverUrl = DEFAULT_SYNC_SERVER_URL) {
  return DEFAULT_CSP_EXTENSION_PAGES;
}

/**
 * Formats a canonical Hybrid Logical Clock (HLC) timestamp:
 * `<15-digit-wallTimeMs>:<4-hex-counter>:<deviceId>`
 */
export function formatHlcTimestamp(wallTimeMs, counter, deviceId) {
  if (!Number.isSafeInteger(wallTimeMs) || wallTimeMs < 0) {
    throw new Error('ERR_HLC_INVALID_WALL_TIME');
  }
  if (!Number.isSafeInteger(counter) || counter < 0 || counter > 0xffff) {
    throw new Error('ERR_HLC_COUNTER_OVERFLOW');
  }
  if (typeof deviceId !== 'string' || deviceId.trim().length === 0) {
    throw new Error('ERR_HLC_INVALID_DEVICE_ID');
  }
  const wallStr = String(wallTimeMs).padStart(15, '0');
  const countStr = counter.toString(16).padStart(4, '0').toLowerCase();
  return `${wallStr}:${countStr}:${deviceId.trim()}`;
}

/**
 * Parses a canonical HLC timestamp string into `{ wallTimeMs, counter, deviceId }`.
 */
export function parseHlcTimestamp(hlc) {
  if (typeof hlc !== 'string') {
    throw new Error('ERR_HLC_MALFORMED');
  }
  const firstColon = hlc.indexOf(':');
  const secondColon = firstColon >= 0 ? hlc.indexOf(':', firstColon + 1) : -1;
  if (firstColon <= 0 || secondColon <= firstColon + 1) {
    throw new Error('ERR_HLC_MALFORMED');
  }
  const wallTimeMs = Number.parseInt(hlc.slice(0, firstColon), 10);
  const counter = Number.parseInt(hlc.slice(firstColon + 1, secondColon), 16);
  const deviceId = hlc.slice(secondColon + 1).trim();
  if (!Number.isSafeInteger(wallTimeMs) || wallTimeMs < 0 || !Number.isSafeInteger(counter) || counter < 0 || deviceId.length === 0) {
    throw new Error('ERR_HLC_MALFORMED');
  }
  return {
    wallTimeMs,
    counter,
    deviceId
  };
}

/**
 * Monotonically advances a local Hybrid Logical Clock (HLC) given `lastHlc` and `nowMs`.
 */
export function advanceHlcTimestamp(lastHlc, nowMs, deviceId) {
  if (!lastHlc) {
    return formatHlcTimestamp(nowMs, 0, deviceId);
  }
  const prev = parseHlcTimestamp(lastHlc);
  if (nowMs > prev.wallTimeMs) {
    return formatHlcTimestamp(nowMs, 0, deviceId);
  }
  return formatHlcTimestamp(prev.wallTimeMs, prev.counter + 1, deviceId);
}

/**
 * Deterministic HLC LWW-Element-Set CRDT comparator matching `apps/relay-server/src/crdt.rs`.
 */
export function shouldIncomingSyncItemWin(incoming, existing) {
  const inc = parseHlcTimestamp(incoming.hlcTimestamp);
  const ext = parseHlcTimestamp(existing.hlcTimestamp);
  if (inc.wallTimeMs !== ext.wallTimeMs) {
    return inc.wallTimeMs > ext.wallTimeMs;
  }
  if (inc.counter !== ext.counter) {
    return inc.counter > ext.counter;
  }
  if (inc.deviceId !== ext.deviceId) {
    return inc.deviceId > ext.deviceId;
  }
  if (incoming.revision !== existing.revision) {
    return incoming.revision > existing.revision;
  }
  if (incoming.deletedAt !== null && existing.deletedAt === null) {
    return true;
  }
  if (incoming.deletedAt === null && existing.deletedAt !== null) {
    return false;
  }
  return incoming.updatedAt > existing.updatedAt;
}

/**
 * Merges local and remote encrypted `DataEnvelope` item arrays using the HLC LWW-Element-Set CRDT.
 */
export function mergeSyncItemsLww(localItems, remoteItems) {
  const byId = new Map();
  for (const local of localItems) {
    byId.set(local.itemId, local);
  }
  for (const remote of remoteItems) {
    const current = byId.get(remote.itemId);
    if (!current || shouldIncomingSyncItemWin(remote, current)) {
      byId.set(remote.itemId, remote);
    }
  }
  return Array.from(byId.values());
}

/**
 * Verifies that an outgoing item strictly obeys the 256-byte padded `DataEnvelope` invariant
 * (`nonce` = 24 bytes, `ciphertext` = $256 \times N + 16$ bytes) before leaving the client.
 * Starts with `await sodium.ready;` on line 1.
 */
export async function assertPaddedSyncItemEnvelope(item) {
  await sodium.ready;
  const nonceBytes = sodium.from_base64(item.nonceBase64, sodium.base64_variants.ORIGINAL);
  if (nonceBytes.byteLength !== AEAD_NONCE_BYTES) {
    throw new Error('ERR_SYNC_INVALID_NONCE_LENGTH');
  }
  const ciphertextBytes = sodium.from_base64(item.ciphertextBase64, sodium.base64_variants.ORIGINAL);
  if (ciphertextBytes.byteLength < PAD_BLOCK_BYTES + AEAD_TAG_BYTES) {
    throw new Error('ERR_SYNC_ENVELOPE_TOO_SHORT');
  }
  const paddedPlaintextLen = ciphertextBytes.byteLength - AEAD_TAG_BYTES;
  if (paddedPlaintextLen % PAD_BLOCK_BYTES !== 0) {
    throw new Error('ERR_SYNC_UNPADDED_ENVELOPE');
  }
}
async function executeHttpRequest(config, req, syncEnabled = Boolean(config && config.syncEnabled)) {
  if (!syncEnabled) {
    throw new Error('Sync is disabled');
  }
  await sodium.ready;
  if (config.transport) {
    return config.transport(req);
  }
  throw new Error('ERR_SYNC_TRANSPORT_REQUIRED_IN_BACKGROUND_SW');
}

/**
 * 1. `POST /v1/auth/register`
 * Enforces `if (!syncEnabled) { throw new Error('Sync is disabled'); }` on line 1,
 * derives `accountAuthPubKey` from `dek` via BLAKE2b `"VG_AUT_1"`, signs `accountId`
 * and `accountAuthPubKey` (`registrationSignature`, Patch VG-03), and registers the account.
 */
export async function registerSyncAccount(config, dek, encryptedHeaderBase64, syncEnabled = Boolean(config && config.syncEnabled)) {
  if (!syncEnabled) {
    throw new Error('Sync is disabled');
  }
  await sodium.ready;
  const origin = validateSyncServerUrl(config.serverUrl);
  const regProof = await signSyncRegistration(dek, config.accountId);
  const payload = {
    accountId: config.accountId,
    deviceId: config.deviceId,
    accountAuthPubKey: regProof.accountAuthPubKey,
    encryptedHeader: encryptedHeaderBase64,
    registrationSignature: regProof.registrationSignature
  };
  const body = JSON.stringify(payload);
  const res = await executeHttpRequest(config, {
    method: 'POST',
    url: `${origin}/v1/auth/register`,
    headers: {
      'content-type': 'application/json'
    },
    body
  });
  if (!res.ok) {
    throw new Error(`ERR_SYNC_REGISTER_FAILED_${String(res.status)}`);
  }
  const parsed = JSON.parse(res.bodyText);
  return parsed;
}

/**
 * 2. `POST /v1/auth/challenge`
 * Enforces `if (!syncEnabled) { throw new Error('Sync is disabled'); }` on line 1
 * and requests a single-use 32-byte (64-hex-char) challenge nonce from the relay server.
 */
export async function requestSyncChallenge(config, syncEnabled = Boolean(config && config.syncEnabled)) {
  if (!syncEnabled) {
    throw new Error('Sync is disabled');
  }
  await sodium.ready;
  const origin = validateSyncServerUrl(config.serverUrl);
  const body = JSON.stringify({
    accountId: config.accountId,
    deviceId: config.deviceId
  });
  const res = await executeHttpRequest(config, {
    method: 'POST',
    url: `${origin}/v1/auth/challenge`,
    headers: {
      'content-type': 'application/json'
    },
    body
  });
  if (!res.ok) {
    throw new Error(`ERR_SYNC_CHALLENGE_FAILED_${String(res.status)}`);
  }
  return JSON.parse(res.bodyText);
}

/**
 * 3. `POST /v1/auth/verify`
 * Enforces `if (!syncEnabled) { throw new Error('Sync is disabled'); }` on line 1,
 * signs `"VG_SYNC_AUTH_V1:" + challengeNonce + accountId + deviceId + timestamp + bodySha256`,
 * and verifies authentication with the relay server.
 */
export async function verifySyncChallenge(config, dek, challengeNonce, timestampMs = Date.now(), syncEnabled = Boolean(config && config.syncEnabled)) {
  if (!syncEnabled) {
    throw new Error('Sync is disabled');
  }
  await sodium.ready;
  const origin = validateSyncServerUrl(config.serverUrl);
  const proof = await signSyncChallenge(dek, {
    challengeNonce,
    accountId: config.accountId,
    deviceId: config.deviceId,
    timestamp: timestampMs,
    body: ''
  });
  const body = JSON.stringify({
    accountId: config.accountId,
    deviceId: config.deviceId,
    challengeNonce,
    timestamp: timestampMs,
    bodySha256: EMPTY_BODY_SHA256,
    signature: proof.signatureBase64
  });
  const res = await executeHttpRequest(config, {
    method: 'POST',
    url: `${origin}/v1/auth/verify`,
    headers: {
      'content-type': 'application/json'
    },
    body
  });
  if (!res.ok) {
    throw new Error(`ERR_SYNC_VERIFY_FAILED_${String(res.status)}`);
  }
  return JSON.parse(res.bodyText);
}

/**
 * 4. `GET /v1/sync/delta?sinceSeq=<u64>` (`pullSyncDelta` / `fetchSyncDelta`)
 * Enforces `if (!syncEnabled) { throw new Error('Sync is disabled'); }` on line 1,
 * fetches a single-use challenge, signs the empty-body request with `VG_AUT_1`, and retrieves
 * all encrypted item deltas since `sinceSeq`.
 */
export async function pullSyncDelta(config, dek, sinceSeq = 0, timestampMs = Date.now(), syncEnabled = Boolean(config && config.syncEnabled)) {
  if (!syncEnabled) {
    throw new Error('Sync is disabled');
  }
  await sodium.ready;
  const origin = validateSyncServerUrl(config.serverUrl);
  const challenge = await requestSyncChallenge(config);
  const proof = await signSyncChallenge(dek, {
    challengeNonce: challenge.challengeNonce,
    accountId: config.accountId,
    deviceId: config.deviceId,
    timestamp: timestampMs,
    body: ''
  });
  const res = await executeHttpRequest(config, {
    method: 'GET',
    url: `${origin}/v1/sync/delta?sinceSeq=${String(sinceSeq)}`,
    headers: {
      ...proof.headers
    }
  });
  if (!res.ok) {
    throw new Error(`ERR_SYNC_DELTA_FAILED_${String(res.status)}`);
  }
  return JSON.parse(res.bodyText);
}

/**
 * Alias for `pullSyncDelta` (`GET /v1/sync/delta?sinceSeq=<u64>`) enforcing
 * `if (!syncEnabled) { throw new Error('Sync is disabled'); }` on line 1.
 */
export async function fetchSyncDelta(config, dek, sinceSeq = 0, timestampMs = Date.now(), syncEnabled = Boolean(config && config.syncEnabled)) {
  if (!syncEnabled) {
    throw new Error('Sync is disabled');
  }
  await sodium.ready;
  return pullSyncDelta(config, dek, sinceSeq, timestampMs, syncEnabled);
}

/**
 * 5. `POST /v1/sync/push`
 * Enforces `if (!syncEnabled) { throw new Error('Sync is disabled'); }` on line 1,
 * validates 256-byte envelope padding on all outgoing items, obtains a single-use challenge,
 * signs the request body SHA-256 with `VG_AUT_1`, and pushes the batch with optimistic CAS
 * on `expectedVaultSeq`.
 */
export async function pushSyncDelta(config, dek, input, timestampMs = Date.now(), syncEnabled = Boolean(config && config.syncEnabled)) {
  if (!syncEnabled) {
    throw new Error('Sync is disabled');
  }
  await sodium.ready;
  const origin = validateSyncServerUrl(config.serverUrl);
  for (const item of input.items) {
    await assertPaddedSyncItemEnvelope(item);
  }
  const challenge = await requestSyncChallenge(config);
  const body = JSON.stringify({
    expectedVaultSeq: input.expectedVaultSeq,
    encryptedManifest: input.encryptedManifest,
    items: input.items
  });
  const proof = await signSyncChallenge(dek, {
    challengeNonce: challenge.challengeNonce,
    accountId: config.accountId,
    deviceId: config.deviceId,
    timestamp: timestampMs,
    body
  });
  const res = await executeHttpRequest(config, {
    method: 'POST',
    url: `${origin}/v1/sync/push`,
    headers: {
      'content-type': 'application/json',
      ...proof.headers
    },
    body
  });
  if (res.status === 409) {
    const conflictJson = JSON.parse(res.bodyText);
    return {
      ok: false,
      status: 409,
      error: conflictJson.error ?? 'ERR_SYNC_CAS_CONFLICT',
      conflictCurrentVaultSeq: conflictJson.currentVaultSeq
    };
  }
  if (!res.ok) {
    throw new Error(`ERR_SYNC_PUSH_FAILED_${String(res.status)}`);
  }
  const parsed = JSON.parse(res.bodyText);
  return {
    ok: true,
    status: res.status,
    newVaultSeq: parsed.newVaultSeq,
    appliedCount: parsed.appliedCount,
    skippedStaleCount: parsed.skippedStaleCount
  };
}

/**
 * 6. `DELETE /v1/account`
 * Enforces `if (!syncEnabled) { throw new Error('Sync is disabled'); }` on line 1,
 * authenticates via Ed25519 challenge-response, and immediately wipes all account data on the relay.
 */
export async function deleteSyncAccount(config, dek, timestampMs = Date.now(), syncEnabled = Boolean(config && config.syncEnabled)) {
  if (!syncEnabled) {
    throw new Error('Sync is disabled');
  }
  await sodium.ready;
  const origin = validateSyncServerUrl(config.serverUrl);
  const challenge = await requestSyncChallenge(config);
  const proof = await signSyncChallenge(dek, {
    challengeNonce: challenge.challengeNonce,
    accountId: config.accountId,
    deviceId: config.deviceId,
    timestamp: timestampMs,
    body: ''
  });
  const res = await executeHttpRequest(config, {
    method: 'DELETE',
    url: `${origin}/v1/account`,
    headers: {
      ...proof.headers
    }
  });
  if (!res.ok) {
    throw new Error(`ERR_SYNC_DELETE_FAILED_${String(res.status)}`);
  }
  return JSON.parse(res.bodyText);
}