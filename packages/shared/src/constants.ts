/**
 * @vaultguard/shared — Cryptographic, KDF, Subkey, Biometric, Shamir & MV3 Constants
 * Locked to ARCHITECTURE.md v5.0 & ENVELOPE_SPEC.md v2
 */

// 1. Argon2id KDF Two-Sided Bounds (OWASP Floor + Worker Ceiling)
export const KDF_MEMORY_MIN_KIB = 19456; // 19 MiB (OWASP Minimum / Mobile Profile)
export const KDF_MEMORY_MAX_KIB = 65536; // 64 MiB (Worker Ceiling / Desktop Default)
export const KDF_TIME_COST_MIN = 2;
export const KDF_TIME_COST = 3; // Desktop Default Iterations
export const KDF_TIME_COST_MAX = 10;
export const KDF_PARALLELISM_MIN = 1;
export const KDF_PARALLELISM = 4; // Desktop Default Lanes
export const KDF_PARALLELISM_MAX = 4;

// 2. Worker Serial Queue Bounds
export const WORKER_CONCURRENCY = 1;
export const WORKER_MAX_QUEUE_DEPTH = 4;

// 3. Canonical AAD & Envelope Versioning
export const ENVELOPE_VERSION = 1;
export const AAD_PREFIX = 'vaultguard:v1:';
export const AAD_BIOMETRIC_PREFIX = 'vaultguard:v2:biometric:';
export const MANIFEST_AAD_PREFIX = 'vaultguard:manifest:v1:';
export const RESERVED_MANIFEST_ITEM_ID = '00000000-0000-4000-8000-000000000000';

// 4. Libsodium BLAKE2b Subkey IDs & Exact 8-Byte Context Strings
export const KEK_ID = 1;
export const REC_ID = 2;
export const MAN_ID = 3;
export const BIO_ID = 4;
export const AUT_ID = 5;
export const RAU_ID = 6;
export const DEV_ID = 7;
export const BLAKE2B_CTX_MASTER_KEK = 'VG_KEK_1'; // 8 ASCII bytes
export const BLAKE2B_CTX_RECOVERY_KEK = 'VG_REC_1'; // 8 ASCII bytes
export const BLAKE2B_CTX_MANIFEST_SIG = 'VG_MAN_S'; // 8 ASCII bytes
export const BLAKE2B_CTX_BIOMETRIC_KEK = 'VG_BIO_1'; // 8 ASCII bytes
export const BLAKE2B_CTX_SYNC_AUTH = 'VG_AUT_1'; // 8 ASCII bytes
export const BLAKE2B_CTX_RECOVERY_AUTH = 'VG_RAU_1'; // 8 ASCII bytes (24-Word Recovery Authority Key)
export const BLAKE2B_CTX_DEVICE_AUTH = 'VG_DEV_1'; // 8 ASCII bytes (Per-Device Identity Key)

// 5. Shamir's Secret Sharing Parameters (2-of-3 Threshold over GF(2^8))
export const SHAMIR_TOTAL_SHARES = 3;
export const SHAMIR_THRESHOLD = 2;

// 6. Primitive Byte Lengths & ISO/IEC 7816-4 Padding Block Size
export const DEK_BYTES = 32; // 256-bit Vault Key
export const RECOVERY_ENTROPY_BYTES = 32; // 256-bit BIP39 Entropy (24 words)
export const SALT_BYTES = 16; // 128-bit Argon2id Salt
export const PRF_SALT_BYTES = 32; // 256-bit WebAuthn PRF Salt
export const AEAD_NONCE_BYTES = 24; // 192-bit XChaCha20-Poly1305-IETF Nonce
export const AEAD_TAG_BYTES = 16; // 128-bit Poly1305 Auth Tag
export const MANIFEST_MAC_BYTES = 32; // 256-bit Keyed BLAKE2b MAC
export const PAD_BLOCK_BYTES = 256; // 256-byte ISO/IEC 7816-4 Block Alignment

// 7. Client-Side Exponential Backoff & Biometric Strike Cap
export const MAX_BACKOFF_SECONDS = 60;
export const BIOMETRIC_MAX_STRIKES = 3;

// 8. MV3 Session, Auto-Save & Clipboard Timers
export const DEFAULT_AUTO_LOCK_MINUTES = 5;
export const AUTO_LOCK_DEFAULT_MINUTES = 15;
export const CLIPBOARD_CLEAR_MINUTES = 0.5; // 30 seconds
export const CLIPBOARD_CLEAR_DELAY_MINUTES = 0.5;
export const PENDING_SAVE_TTL_MINUTES = 2; // 120 seconds
export const CRYPTOKEY_PROBE_TIMEOUT_MS = 150;
export const PROBE_TIMEOUT_MS = 150;
export const PRIVATE_MODE_QUOTA_THRESHOLD_BYTES = 67108864; // 64 MiB

export const ALARM_AUTO_LOCK = 'VAULT_AUTO_LOCK';
export const ALARM_CLEAR_CLIPBOARD = 'CLEAR_CLIPBOARD';
export const ALARM_EXPIRE_PENDING_SAVE = 'EXPIRE_PENDING_SAVE';

export const DEFAULT_KDF_PARAMS = {
  m: KDF_MEMORY_MAX_KIB,
  t: KDF_TIME_COST,
  p: KDF_PARALLELISM,
};
