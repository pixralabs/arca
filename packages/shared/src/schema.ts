/**
 * @vaultguard/shared — Formal Item Schemas, TOTP Validators, URI Parser & Manifest Types
 * Locked to ARCHITECTURE.md v4.3 §5, TOTP_SPEC.md v1.1 & Blocker 2B Resolution
 */

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE32_REGEX = /^[A-Z2-7]+=*$/;

// Strip null bytes and Unicode Bidi-override spoofing characters (ARCHITECTURE.md §5.1)
const DANGEROUS_CONTROL_CHARS = /[\u0000\u202A-\u202E\u2066-\u2069]/g;

export function sanitizeTextField(input: string): string {
  return input.replace(DANGEROUS_CONTROL_CHARS, '');
}

export function isValidUuidV4(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4_REGEX.test(value);
}

export function normalizeBase32Secret(rawSecret: string): string {
  return sanitizeTextField(rawSecret).replace(/[\s-]+/g, '').toUpperCase();
}

export function isValidBase32Secret(secret: string): boolean {
  const normalized = normalizeBase32Secret(secret);
  if (normalized.length < 16 || normalized.length > 512) {
    return false;
  }
  return BASE32_REGEX.test(normalized);
}

export interface TotpConfig {
  secret: string;
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  digits: 6 | 8;
  period: 30 | 60;
  issuer?: string;
  accountName?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Parses either a full `otpauth://totp/...` URI or a raw Base32 secret string
 * into a normalized `TotpConfig`. Rejects `otpauth://hotp/...` or malformed secrets.
 */
export function parseOtpauthUri(input: string): TotpConfig {
  const trimmed = sanitizeTextField(input).trim();
  if (!trimmed.toLowerCase().startsWith('otpauth://')) {
    const normalizedSecret = normalizeBase32Secret(trimmed);
    if (!isValidBase32Secret(normalizedSecret)) {
      throw new Error('ERR_TOTP_INVALID_SECRET');
    }
    return {
      secret: normalizedSecret,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('ERR_TOTP_INVALID_URI');
  }

  const hostType = parsed.hostname.toLowerCase();
  if (hostType === 'hotp') {
    throw new Error('ERR_TOTP_UNSUPPORTED_HOTP');
  }
  if (hostType !== 'totp') {
    throw new Error('ERR_TOTP_INVALID_URI');
  }

  const rawSecret = parsed.searchParams.get('secret') ?? '';
  const secret = normalizeBase32Secret(rawSecret);
  if (!isValidBase32Secret(secret)) {
    throw new Error('ERR_TOTP_INVALID_SECRET');
  }

  const rawAlg = (parsed.searchParams.get('algorithm') ?? 'SHA1').toUpperCase();
  if (rawAlg !== 'SHA1' && rawAlg !== 'SHA256' && rawAlg !== 'SHA512') {
    throw new Error('ERR_TOTP_INVALID_ALGORITHM');
  }

  const rawDigits = Number(parsed.searchParams.get('digits') ?? '6');
  if (rawDigits !== 6 && rawDigits !== 8) {
    throw new Error('ERR_TOTP_INVALID_DIGITS');
  }

  const rawPeriod = Number(parsed.searchParams.get('period') ?? '30');
  if (rawPeriod !== 30 && rawPeriod !== 60) {
    throw new Error('ERR_TOTP_INVALID_PERIOD');
  }

  const labelPath = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  const labelIssuer = labelPath.includes(':') ? labelPath.split(':')[0].trim() : undefined;
  const paramIssuer = parsed.searchParams.get('issuer')?.trim();
  const issuer = paramIssuer || labelIssuer;

  return {
    secret,
    algorithm: rawAlg as 'SHA1' | 'SHA256' | 'SHA512',
    digits: rawDigits as 6 | 8,
    period: rawPeriod as 30 | 60,
    issuer: issuer && issuer.length <= 128 ? issuer : undefined,
  };
}

export function validateTotpConfig(config: unknown): ValidationResult {
  if (typeof config !== 'object' || config === null) {
    return {
      valid: false,
      errors: ['TotpConfig must be a non-null object'],
    };
  }
  const c = config as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof c['secret'] !== 'string' || !isValidBase32Secret(c['secret'])) {
    errors.push('secret must be a valid RFC 4648 Base32 string between 16 and 512 chars');
  }
  if (c['algorithm'] !== 'SHA1' && c['algorithm'] !== 'SHA256' && c['algorithm'] !== 'SHA512') {
    errors.push('algorithm must be SHA1, SHA256, or SHA512');
  }
  if (c['digits'] !== 6 && c['digits'] !== 8) {
    errors.push('digits must be 6 or 8');
  }
  if (c['period'] !== 30 && c['period'] !== 60) {
    errors.push('period must be 30 or 60');
  }
  if (c['issuer'] !== undefined && (typeof c['issuer'] !== 'string' || c['issuer'].length > 128)) {
    errors.push('issuer must be a string of at most 128 characters');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function isAllowedVaultUrl(rawUrl: string): boolean {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 2048) {
    return false;
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'https:') {
      return parsed.hostname.length > 0;
    }
    if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// --- Envelope, Header, Manifest & Item Interfaces ---

export interface KdfParams {
  m: number;
  t: number;
  p: number;
}

export interface PasswordProtectedKeyEnvelope {
  version: number;
  namespace: 'PasswordProtectedKeyEnvelope';
  salt: Uint8Array | string;
  nonce: Uint8Array | string;
  ciphertext: Uint8Array | string;
  kdfParams: KdfParams;
  createdAt: number;
}

export interface SecretProtectedKeyEnvelope {
  version: number;
  namespace: 'SecretProtectedKeyEnvelope';
  nonce: Uint8Array | string;
  ciphertext: Uint8Array | string;
  createdAt: number;
}

export interface BiometricProtectedKeyEnvelope {
  version: number;
  namespace: 'BiometricProtectedKeyEnvelope';
  credentialId: string;
  prfSalt?: Uint8Array | string;
  nonce: Uint8Array | string;
  ciphertext: Uint8Array | string;
  failedAttempts: number;
  createdAt: number;
}

export interface VaultHeader {
  version: number;
  keyVersion: number;
  masterSlot: PasswordProtectedKeyEnvelope;
  recoverySlot: SecretProtectedKeyEnvelope;
  biometricSlot?: BiometricProtectedKeyEnvelope;
  createdAt: number;
  updatedAt: number;
}

export function isValidVaultHeader(val: unknown): val is VaultHeader {
  if (typeof val !== 'object' || val === null) return false;
  const h = val as Record<string, unknown>;
  return (
    h.version === 1 &&
    typeof h.keyVersion === 'number' &&
    typeof h.masterSlot === 'object' &&
    h.masterSlot !== null &&
    typeof h.recoverySlot === 'object' &&
    h.recoverySlot !== null
  );
}

export interface VaultManifest {
  version: number;
  vaultSeq: number;
  keyVersion: number;
  itemRevisions: Record<string, number>;
  globalRevision?: number;
  itemCount?: number;
  vaultId?: string;
  manifestMac?: Uint8Array | string;
}

export function isValidVaultManifest(val: unknown): val is VaultManifest {
  if (typeof val !== 'object' || val === null) return false;
  const m = val as Record<string, unknown>;
  return (
    m.version === 1 &&
    typeof m.vaultSeq === 'number' &&
    typeof m.keyVersion === 'number' &&
    typeof m.itemRevisions === 'object' &&
    m.itemRevisions !== null
  );
}

export interface VaultItemPlaintext {
  title: string;
  username: string;
  password: string;
  urls: string[];
  notes: string;
  matchMode?: 'exact_origin' | 'base_domain' | 'never';
  totpConfig?: TotpConfig;
  tags?: string[];
  favorite?: boolean;
}

export function isValidVaultItemPlaintext(val: unknown): val is VaultItemPlaintext {
  if (typeof val !== 'object' || val === null) return false;
  const p = val as Record<string, unknown>;
  return (
    typeof p.title === 'string' &&
    typeof p.username === 'string' &&
    typeof p.password === 'string' &&
    Array.isArray(p.urls)
  );
}

export interface VaultItemRecord {
  id: string;
  schemaVersion: number;
  revision: number;
  nonce: Uint8Array | string;
  ciphertext: Uint8Array | string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export function isValidVaultItemRecord(val: unknown): val is VaultItemRecord {
  if (typeof val !== 'object' || val === null) return false;
  const r = val as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.revision === 'number' &&
    typeof r.createdAt === 'number' &&
    typeof r.updatedAt === 'number'
  );
}
