/**
 * @file packages/crypto/src/audit.ts
 * @description Zero-Knowledge In-RAM Password Strength & Reuse Security Audit Engine.
 *
 * Requirements:
 * 1. auditPasswordStrength(): Flag any password with < 12 characters or lacking complexity.
 * 2. detectReusedPasswords(): Detect if the same plaintext password is used across multiple itemIds or URLs.
 * 3. calculateVaultSecurityScore(): Compute an overall 0–100% security score for vault health.
 * 4. All checks execute 100% locally in volatile RAM without network requests.
 */

export interface PasswordStrengthResult {
  isWeak: boolean;
  score: number; // 0 to 100
  reasons: string[];
  hasMinLength: boolean; // >= 12 characters
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasDigits: boolean;
  hasSymbols: boolean;
  isCommon: boolean;
}

export const COMMON_WEAK_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty',
  'qwerty123',
  'admin',
  'admin123',
  'welcome',
  'welcome1',
  'welcome123',
  'letmein',
  'letmein123',
  'iloveyou',
  'abc123',
  'monkey',
  'dragon',
  'trustno1',
  'baseball',
  'football',
  'master',
  'sunshine',
  'princess',
  'charlie',
  'shadow',
  'superman',
  'michael',
  'jennifer',
  '666666',
  '111111',
  '000000',
  'passw0rd',
  'p@ssw0rd',
  'p@ssword',
  'correcthorsebatterystaple',
]);

/**
 * Audits a single plaintext password for length, complexity, and known common dictionary matches.
 * Flagged as weak if length < 12 characters, lacks complexity (< 3 character classes),
 * is digits-only, or matches known compromised dictionary entries.
 */
export function auditPasswordStrength(password: string): PasswordStrengthResult {
  const pwd = typeof password === 'string' ? password : '';
  const length = pwd.length;
  const reasons: string[] = [];

  if (length === 0) {
    return {
      isWeak: true,
      score: 0,
      reasons: ['Password is empty'],
      hasMinLength: false,
      hasUppercase: false,
      hasLowercase: false,
      hasDigits: false,
      hasSymbols: false,
      isCommon: false,
    };
  }

  const hasLower = /[a-z]/.test(pwd);
  const hasUpper = /[A-Z]/.test(pwd);
  const hasDigits = /[0-9]/.test(pwd);
  const hasSymbols = /[^a-zA-Z0-9]/.test(pwd);
  const hasMinLength = length >= 12;

  const charClassCount = [hasLower, hasUpper, hasDigits, hasSymbols].filter(Boolean).length;
  const isCommon = COMMON_WEAK_PASSWORDS.has(pwd.toLowerCase().trim());

  if (isCommon) {
    reasons.push('Commonly compromised password');
  }

  if (!hasMinLength) {
    reasons.push('Weak (< 12 characters)');
  }

  if (/^\d+$/.test(pwd)) {
    reasons.push('Digits-only password lacks complexity');
  } else if (charClassCount < 3) {
    const missing: string[] = [];
    if (!hasUpper) missing.push('uppercase');
    if (!hasLower) missing.push('lowercase');
    if (!hasDigits) missing.push('numbers');
    if (!hasSymbols) missing.push('symbols');
    reasons.push(`Lacks complexity (missing ${missing.join(', ')})`);
  }

  // Calculate score 0 to 100
  let score = 0;
  if (isCommon) {
    score = Math.min(15, length * 2);
  } else {
    // Length contribution (up to 60 points)
    if (length < 8) {
      score += 15;
    } else if (length < 12) {
      score += 30 + (length - 8) * 3;
    } else if (length < 16) {
      score += 45 + (length - 12) * 3;
    } else {
      score += 60;
    }

    // Complexity contribution (up to 40 points: 10 per character class)
    score += charClassCount * 10;
  }

  // Cap score if flagged as weak
  const isWeak = !hasMinLength || charClassCount < 3 || isCommon || /^\d+$/.test(pwd);
  if (isWeak && score > 50) {
    score = 50;
  }

  return {
    isWeak,
    score: Math.min(100, Math.max(0, score)),
    reasons,
    hasMinLength,
    hasUppercase: hasUpper,
    hasLowercase: hasLower,
    hasDigits: hasDigits,
    hasSymbols: hasSymbols,
    isCommon,
  };
}

export interface ReusedPasswordGroup {
  password: string;
  count: number;
  itemIds: string[];
  urls: string[];
}

export interface ReusedPasswordResult {
  reusedItemIds: Set<string>;
  groups: ReusedPasswordGroup[];
  reusedCount: number;
  byItemId: Map<string, { count: number; otherUrls: string[]; otherItemIds: string[] }>;
}

export interface ItemForAudit {
  id: string;
  password?: string;
  urls?: string[];
  title?: string;
  deletedAt?: number | null;
}

/**
 * Detects whether the same plaintext password is used across multiple itemIds or URLs.
 */
export function detectReusedPasswords(items: ItemForAudit[]): ReusedPasswordResult {
  const activeItems = items.filter(i => i.deletedAt === null || i.deletedAt === undefined);
  const passwordMap = new Map<string, ItemForAudit[]>();

  for (const item of activeItems) {
    const pwd = (item.password ?? '').trim();
    if (pwd.length === 0) continue;
    const existing = passwordMap.get(pwd) ?? [];
    existing.push(item);
    passwordMap.set(pwd, existing);
  }

  const reusedItemIds = new Set<string>();
  const groups: ReusedPasswordGroup[] = [];
  const byItemId = new Map<string, { count: number; otherUrls: string[]; otherItemIds: string[] }>();

  for (const [password, groupItems] of passwordMap.entries()) {
    if (groupItems.length > 1) {
      const itemIds = groupItems.map(i => i.id);
      const allUrls = groupItems.flatMap(i => i.urls ?? []).filter(Boolean);

      for (const item of groupItems) {
        reusedItemIds.add(item.id);
        const otherItems = groupItems.filter(other => other.id !== item.id);
        const otherUrls = otherItems.flatMap(o => o.urls ?? []).filter(Boolean);
        const otherItemIds = otherItems.map(o => o.id);
        byItemId.set(item.id, {
          count: groupItems.length,
          otherUrls,
          otherItemIds,
        });
      }

      groups.push({
        password,
        count: groupItems.length,
        itemIds,
        urls: allUrls,
      });
    }
  }

  return {
    reusedItemIds,
    groups,
    reusedCount: reusedItemIds.size,
    byItemId,
  };
}

/**
 * Checks if a specific password is weak or reused against an existing set of items.
 * Used for the "Save Existing" flow prompt.
 */
export function checkPasswordForSavePrompt(
  password: string,
  currentDomainOrUrl: string,
  existingItems: ItemForAudit[]
): {
  isWeak: boolean;
  isReused: boolean;
  reusedCount: number;
  weakReasons: string[];
  warningMessage: string | null;
} {
  const strength = auditPasswordStrength(password);
  const trimmed = password.trim();

  const matchingItems = existingItems.filter(item => {
    if (item.deletedAt !== null && item.deletedAt !== undefined) return false;
    return (item.password ?? '').trim() === trimmed && trimmed.length > 0;
  });

  const reusedCount = matchingItems.length;
  const isReused = reusedCount > 0;

  let warningMessage: string | null = null;
  if (strength.isWeak && isReused) {
    const siteLabel = reusedCount === 1 ? '1 other site' : `${reusedCount} other sites`;
    warningMessage = `Warning: This password is weak and used on ${siteLabel}.`;
  } else if (strength.isWeak) {
    warningMessage = `Warning: This password is weak (${strength.reasons[0] ?? '< 12 characters'}).`;
  } else if (isReused) {
    const siteLabel = reusedCount === 1 ? '1 other site' : `${reusedCount} other sites`;
    warningMessage = `Warning: This password is already used on ${siteLabel}.`;
  }

  return {
    isWeak: strength.isWeak,
    isReused,
    reusedCount,
    weakReasons: strength.reasons,
    warningMessage,
  };
}

export interface VaultSecurityScoreResult {
  score: number; // 0 to 100
  rating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'AT_RISK';
  weakCount: number;
  reusedCount: number;
  totalCount: number;
  weakItemIds: Set<string>;
  reusedItemIds: Set<string>;
  findings: Map<string, string[]>;
}

/**
 * Calculates overall vault security score (0 - 100%) and categorizes weak and reused credentials.
 */
export function calculateVaultSecurityScore(items: ItemForAudit[]): VaultSecurityScoreResult {
  const activeItems = items.filter(i => i.deletedAt === null || i.deletedAt === undefined);
  const totalCount = activeItems.length;

  if (totalCount === 0) {
    return {
      score: 100,
      rating: 'EXCELLENT',
      weakCount: 0,
      reusedCount: 0,
      totalCount: 0,
      weakItemIds: new Set(),
      reusedItemIds: new Set(),
      findings: new Map(),
    };
  }

  const reuseResult = detectReusedPasswords(activeItems);
  const weakItemIds = new Set<string>();
  const findings = new Map<string, string[]>();

  let totalItemScoreSum = 0;

  for (const item of activeItems) {
    const pwd = item.password ?? '';
    const strength = auditPasswordStrength(pwd);
    const itemReasons: string[] = [];

    if (strength.isWeak) {
      weakItemIds.add(item.id);
      itemReasons.push(...strength.reasons);
    }

    if (reuseResult.reusedItemIds.has(item.id)) {
      const reuseInfo = reuseResult.byItemId.get(item.id);
      const others = (reuseInfo?.count ?? 2) - 1;
      itemReasons.push(`Reused on ${others} other site${others > 1 ? 's' : ''}`);
    }

    if (itemReasons.length > 0) {
      findings.set(item.id, itemReasons);
    }

    // Weight score: penalty if reused
    let itemScore = strength.score;
    if (reuseResult.reusedItemIds.has(item.id)) {
      itemScore = Math.max(10, itemScore - 40);
    }
    totalItemScoreSum += itemScore;
  }

  const averageScore = Math.round(totalItemScoreSum / totalCount);
  const weakCount = weakItemIds.size;
  const reusedCount = reuseResult.reusedCount;

  let rating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'AT_RISK' = 'EXCELLENT';
  if (averageScore < 50 || weakCount > totalCount * 0.4 || reusedCount > totalCount * 0.4) {
    rating = 'AT_RISK';
  } else if (averageScore < 70) {
    rating = 'FAIR';
  } else if (averageScore < 85) {
    rating = 'GOOD';
  }

  return {
    score: averageScore,
    rating,
    weakCount,
    reusedCount,
    totalCount,
    weakItemIds,
    reusedItemIds: reuseResult.reusedItemIds,
    findings,
  };
}

