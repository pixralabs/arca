/**
 * @vaultguard/shared — Formal Item Schemas, TOTP Validators, URI Parser & Manifest Types
 * Locked to ARCHITECTURE.md v4.3 §5, TOTP_SPEC.md v1.1 & Blocker 2B Resolution (Unix epoch ms numbers)
 */

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE32_REGEX = /^[A-Z2-7]+=*$/;

// Strip null bytes and Unicode Bidi-override spoofing characters (ARCHITECTURE.md §5.1)
const DANGEROUS_CONTROL_CHARS = /[\u0000\u202A-\u202E\u2066-\u2069]/g;
export function sanitizeTextField(input) {
  return input.replace(DANGEROUS_CONTROL_CHARS, '');
}
export function isValidUuidV4(value) {
  return typeof value === 'string' && UUID_V4_REGEX.test(value);
}
export function normalizeBase32Secret(rawSecret) {
  return sanitizeTextField(rawSecret).replace(/[\s-]+/g, '').toUpperCase();
}
export function isValidBase32Secret(secret) {
  const normalized = normalizeBase32Secret(secret);
  if (normalized.length < 16 || normalized.length > 512) {
    return false;
  }
  return BASE32_REGEX.test(normalized);
}

/**
 * Parses either a full `otpauth://totp/...` URI or a raw Base32 secret string
 * into a normalized `TotpConfig`. Rejects `otpauth://hotp/...` or malformed secrets.
 */
export function parseOtpauthUri(input) {
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
      period: 30
    };
  }
  let parsed;
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
    algorithm: rawAlg,
    digits: rawDigits,
    period: rawPeriod,
    issuer: issuer && issuer.length <= 128 ? issuer : undefined
  };
}
export function validateTotpConfig(config) {
  if (typeof config !== 'object' || config === null) {
    return {
      valid: false,
      errors: ['TotpConfig must be a non-null object']
    };
  }
  const c = config;
  const errors = [];
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
    errors
  };
}
export function isAllowedVaultUrl(rawUrl) {
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
function validateBaseFields(item, expectedType) {
  const errors = [];
  if (typeof item !== 'object' || item === null) {
    return ['Item must be a non-null object'];
  }
  const rec = item;
  if (!isValidUuidV4(rec['id'])) {
    errors.push('Invalid or missing UUIDv4 id');
  }
  if (!isValidUuidV4(rec['vaultId'])) {
    errors.push('Invalid or missing UUIDv4 vaultId');
  }
  if (rec['type'] !== expectedType) {
    errors.push(`Expected item type "${expectedType}"`);
  }
  if (typeof rec['title'] !== 'string' || rec['title'].trim().length === 0 || rec['title'].length > 256) {
    errors.push('Title must be a non-empty string of at most 256 characters');
  }
  if (!Array.isArray(rec['tags']) || rec['tags'].length > 20) {
    errors.push('Tags must be an array of at most 20 items');
  } else {
    for (const tag of rec['tags']) {
      if (typeof tag !== 'string' || tag.trim().length === 0 || tag.length > 32) {
        errors.push('Each tag must be a non-empty string of at most 32 characters');
        break;
      }
    }
  }
  if (typeof rec['favorite'] !== 'boolean') {
    errors.push('favorite must be a boolean');
  }
  if (typeof rec['createdAt'] !== 'number' || !Number.isInteger(rec['createdAt']) || rec['createdAt'] <= 0) {
    errors.push('createdAt must be a positive Unix epoch millisecond integer');
  }
  if (typeof rec['updatedAt'] !== 'number' || !Number.isInteger(rec['updatedAt']) || typeof rec['createdAt'] === 'number' && rec['updatedAt'] < rec['createdAt']) {
    errors.push('updatedAt must be a Unix epoch millisecond integer >= createdAt');
  }
  if (typeof rec['revision'] !== 'number' || !Number.isInteger(rec['revision']) || rec['revision'] < 1) {
    errors.push('revision must be an integer >= 1');
  }
  if (typeof rec['deleted'] !== 'boolean') {
    errors.push('deleted must be a boolean');
  } else if (rec['deleted'] === true) {
    if (typeof rec['deletedAt'] !== 'number' || !Number.isInteger(rec['deletedAt']) || rec['deletedAt'] <= 0) {
      errors.push('deletedAt must be a positive Unix epoch millisecond integer when deleted is true');
    }
  } else if (rec['deletedAt'] !== null) {
    errors.push('deletedAt must be null when deleted is false');
  }
  return errors;
}
export function validateLoginItem(item) {
  const errors = validateBaseFields(item, 'login');
  if (typeof item !== 'object' || item === null) {
    return {
      valid: false,
      errors
    };
  }
  const rec = item;
  if (typeof rec['username'] !== 'string' || rec['username'].length > 512) {
    errors.push('username must be a string of at most 512 characters');
  }
  if (typeof rec['password'] !== 'string' || rec['password'].length > 4096) {
    errors.push('password must be a string of at most 4096 characters');
  }
  if (typeof rec['notes'] !== 'string' || rec['notes'].length > 10000) {
    errors.push('notes must be a string of at most 10000 characters');
  }
  if (!Array.isArray(rec['urls']) || rec['urls'].length > 25) {
    errors.push('urls must be an array of at most 25 entries');
  } else {
    for (const entry of rec['urls']) {
      if (typeof entry !== 'object' || entry === null) {
        errors.push('Each URL entry must be an object');
        break;
      }
      const u = entry;
      if (typeof u['url'] !== 'string' || !isAllowedVaultUrl(u['url'])) {
        errors.push('Each URL must be a valid https:// (or http://localhost) URI <= 2048 chars');
        break;
      }
      if (u['matchMode'] !== 'exact_origin' && u['matchMode'] !== 'base_domain' && u['matchMode'] !== 'never') {
        errors.push('Invalid URL matchMode');
        break;
      }
    }
  }
  return {
    valid: errors.length === 0,
    errors
  };
}
export function validateTOTPItem(item) {
  const errors = validateBaseFields(item, 'totp');
  if (typeof item !== 'object' || item === null) {
    return {
      valid: false,
      errors
    };
  }
  const rec = item;
  if (typeof rec['issuer'] !== 'string' || rec['issuer'].trim().length === 0 || rec['issuer'].length > 128) {
    errors.push('issuer must be a non-empty string of at most 128 characters');
  }
  if (typeof rec['accountName'] !== 'string' || rec['accountName'].trim().length === 0 || rec['accountName'].length > 256) {
    errors.push('accountName must be a non-empty string of at most 256 characters');
  }
  const totpRes = validateTotpConfig(rec['totp']);
  if (!totpRes.valid) {
    errors.push(...totpRes.errors);
  }
  if (typeof rec['notes'] !== 'string' || rec['notes'].length > 10000) {
    errors.push('notes must be a string of at most 10000 characters');
  }
  return {
    valid: errors.length === 0,
    errors
  };
}
export function validateSecureNoteItem(item) {
  const errors = validateBaseFields(item, 'note');
  if (typeof item !== 'object' || item === null) {
    return {
      valid: false,
      errors
    };
  }
  const rec = item;
  if (typeof rec['content'] !== 'string' || rec['content'].length > 25000) {
    errors.push('content must be a string of at most 25000 characters');
  }
  return {
    valid: errors.length === 0,
    errors
  };
}