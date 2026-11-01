/**
 * @vaultguard/crypto — Public API Barrel (`index.ts`)
 * Re-exports only the public cryptographic interface.
 */

export { padTo256, unpadFrom256 } from './padding.js';
export {
  assertValidKdfParams,
  deriveMasterKEK,
  WorkerSerialQueue,
  computeBackoffDelayMs,
  DEFAULT_DESKTOP_KDF_PARAMS,
  OWASP_MOBILE_KDF_PARAMS,
  OWASP_MIN_MEMORY_KIB,
  WORKER_MAX_MEMORY_KIB,
} from './kdf.js';
export { handleWorkerMessage } from './worker.js';
export type { WorkerRequest, WorkerResponse, WorkerSuccessResponse, WorkerErrorResponse } from './worker.js';
export { generatePassword, generatePassphrase, DEFAULT_PASSWORD_OPTIONS } from './generator.js';
export type { PasswordGeneratorOptions } from './generator.js';
export { canonicalJSON, signManifest, verifyManifest } from './manifest.js';
export {
  createVault,
  unlockWithMaster,
  unlockWithRecovery,
  rotateMasterPassword,
  sealItem,
  unsealItem,
  buildItemAad,
  AAD_MASTER_ENVELOPE,
  AAD_RECOVERY_ENVELOPE,
} from './envelope.js';
export type { CreateVaultResult } from './envelope.js';
export { splitRecoveryEntropy, combineRecoveryShares } from './shamir.js';
export {
  deriveBiometricKEK,
  sealBiometricSlot,
  unsealBiometricSlot,
  buildBiometricAad,
} from './biometricEnvelope.js';
export { generateTotpCode, decodeBase32ToBytes, formatTotpCode } from './totp.js';
export type { TotpResult } from './totp.js';
export {
  SYNC_AUTH_DOMAIN_PREFIX,
  SYNC_REGISTER_DOMAIN_PREFIX,
  ED25519_PUBLIC_KEY_BYTES,
  ED25519_SECRET_KEY_BYTES,
  ED25519_SIGNATURE_BYTES,
  EMPTY_BODY_SHA256,
  buildSyncRegisterPreimage,
  buildSyncAuthPreimage,
  computeBodySha256Hex,
  deriveSyncAuthKeyPair,
  signSyncRegistration,
  verifySyncRegistrationSignature,
  signSyncChallenge,
  verifySyncChallengeSignature,
} from './syncAuth.js';
export type {
  SyncAuthPreimageInput,
  SyncKeyPair,
  RegistrationProof,
  ChallengeSignatureInput,
  ChallengeProof,
} from './syncAuth.js';
export {
  DEFAULT_SYNC_SERVER_URL,
  DEFAULT_CSP_EXTENSION_PAGES,
  validateSyncServerUrl,
  buildSyncContentSecurityPolicy,
  formatHlcTimestamp,
  parseHlcTimestamp,
  advanceHlcTimestamp,
  shouldIncomingSyncItemWin,
  mergeSyncItemsLww,
  assertPaddedSyncItemEnvelope,
  registerSyncAccount,
  requestSyncChallenge,
  verifySyncChallenge,
  pullSyncDelta,
  fetchSyncDelta,
  pushSyncDelta,
  deleteSyncAccount,
} from './syncClient.js';
export type {
  SyncConfig,
  HttpRequest,
  HttpResponse,
  HlcTimestampComponents,
  SyncItemEnvelope,
  PushDeltaInput,
} from './syncClient.js';
export {
  DEFAULT_SHARE_BASE_URL,
  DEFAULT_SHARE_RELAY_URL,
  DEFAULT_SHARE_TTL_MS,
  AAD_SHARE_PREFIX,
  SHARE_BURN_TOKEN_CONTEXT,
  buildShareAad,
  deriveShareBurnToken,
  parseShareUrlFragment,
  encryptSharePayload,
  decryptSharePayload,
  createEphemeralShare,
  consumeEphemeralShare,
  burnEphemeralShare,
} from './secureShare.js';
export type {
  EphemeralSharePayload,
  EphemeralShareOptions,
  CreatedEphemeralShare,
  ParsedShareUrl,
  BurnEphemeralShareOptions,
  ConsumeEphemeralShareOptions,
} from './secureShare.js';
