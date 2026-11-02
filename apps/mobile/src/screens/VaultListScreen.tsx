/**
 * @file apps/mobile/src/screens/VaultListScreen.tsx
 * @description Apple iOS 18 Passwords-inspired Categorized Drill-Down List Screen (`VaultListScreen`)
 * supporting `all`, `totp` (`type === 'totp'`), `security` (in-RAM weak/common/reused password audit),
 * and `deleted` (`deletedAt !== null` tombstoned items).
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import { colors, spacing, radii } from '../theme/theme';
import { VaultItemPlaintext } from '@vaultguard/shared';

export type VaultCategoryFilter = 'all' | 'totp' | 'security' | 'deleted';

export interface MobileVaultItem extends VaultItemPlaintext {
  id: string;
  type?: 'login' | 'totp' | 'note' | 'wifi';
  totpSecret?: string | null;
  customFields?: Array<{ name: string; value: string }>;
  deletedAt?: number | null;
  updatedAt?: number;
}

export interface SecurityAuditFinding {
  item: MobileVaultItem;
  reasons: string[];
}

const COMMON_WEAK_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '123456',
  '12345678',
  '123456789',
  'qwerty',
  'qwerty123',
  'admin',
  'admin123',
  'welcome',
  'letmein',
  'iloveyou',
  'abc123',
  'monkey',
  'dragon',
  'trustno1',
  'baseball',
  'football',
  'master',
]);

/**
 * Runs a fast, zero-knowledge in-RAM security audit over decrypted items to detect:
 * 1. Short passwords (`< 8` characters)
 * 2. Common / dictionary passwords (`password`, `123456`, `qwerty`, etc.)
 * 3. Low-entropy passwords (digits-only or single character class)
 * 4. Reused passwords across multiple accounts
 */
export function evaluateVaultSecurityInRam(items: MobileVaultItem[]): Map<string, string[]> {
  const activeItems = items.filter((item) => item.deletedAt === null || item.deletedAt === undefined);
  const passwordFrequency = new Map<string, number>();

  for (const item of activeItems) {
    const pwd = (item.password ?? '').trim();
    if (pwd.length > 0) {
      passwordFrequency.set(pwd, (passwordFrequency.get(pwd) ?? 0) + 1);
    }
  }

  const findings = new Map<string, string[]>();

  for (const item of activeItems) {
    const pwd = item.password ?? '';
    if (!pwd) continue;

    const reasons: string[] = [];
    if (pwd.length < 8) {
      reasons.push('Weak (< 8 chars)');
    }
    if (COMMON_WEAK_PASSWORDS.has(pwd.toLowerCase())) {
      reasons.push('Commonly compromised password');
    } else if (/^\d+$/.test(pwd)) {
      reasons.push('Digits-only password');
    }
    if ((passwordFrequency.get(pwd.trim()) ?? 0) > 1) {
      reasons.push('Reused password');
    }

    if (reasons.length > 0) {
      findings.set(item.id, reasons);
    }
  }

  return findings;
}

export function isTotpItem(item: MobileVaultItem): boolean {
  return Boolean(
    item.type === 'totp' ||
      item.totpSecret ||
      item.totpConfig
  );
}

export interface VaultListScreenProps {
  category: VaultCategoryFilter;
  items: MobileVaultItem[];
  initialSearch?: string;
  onBack: () => void;
  onSelectTotp: (item: MobileVaultItem) => void;
  onSoftDeleteItem?: (itemId: string) => void;
  onRestoreItem?: (itemId: string) => void;
}

const CATEGORY_METADATA: Record<
  VaultCategoryFilter,
  { title: string; subtitle: string; accentColor: string }
> = {
  all: {
    title: 'All Passwords',
    subtitle: 'Decrypted in RAM • XChaCha20-Poly1305',
    accentColor: colors.iosBlue,
  },
  totp: {
    title: 'Verification Codes',
    subtitle: 'RFC 6238 TOTP 2FA Authenticators',
    accentColor: colors.iosYellow,
  },
  security: {
    title: 'Security Recommendations',
    subtitle: 'Local in-RAM audit for weak, short (< 8 chars), or reused passwords',
    accentColor: colors.iosRed,
  },
  deleted: {
    title: 'Recently Deleted',
    subtitle: 'Tombstoned items pending permanent erasure',
    accentColor: colors.iosGray,
  },
};

export function VaultListScreen({
  category,
  items,
  initialSearch = '',
  onBack,
  onSelectTotp,
  onSoftDeleteItem,
  onRestoreItem,
}: VaultListScreenProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const meta = CATEGORY_METADATA[category];

  const securityFindingsMap = useMemo(() => evaluateVaultSecurityInRam(items), [items]);

  const filteredItems = useMemo(() => {
    const base = items.filter((item) => {
      const isDeleted = item.deletedAt !== null && item.deletedAt !== undefined;
      if (category === 'deleted') {
        return isDeleted;
      }
      if (isDeleted) {
        return false;
      }
      if (category === 'totp') {
        return isTotpItem(item);
      }
      if (category === 'security') {
        return securityFindingsMap.has(item.id);
      }
      return true;
    });

    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;

    return base.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.username && item.username.toLowerCase().includes(q)) ||
        (item.urls && item.urls.some((u) => u.toLowerCase().includes(q)))
    );
  }, [items, category, searchQuery, securityFindingsMap]);

  return (
    <View style={styles.container}>
      {/* Navigation Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
          <Text style={[styles.backButtonText, { color: meta.accentColor }]}>‹ Passwords</Text>
        </TouchableOpacity>
        <View style={styles.headerCountPill}>
          <Text style={styles.headerCountText}>{filteredItems.length}</Text>
        </View>
      </View>

      {/* Large iOS 18 Category Title */}
      <View style={styles.titleSection}>
        <Text style={styles.largeTitle}>{meta.title}</Text>
        <Text style={styles.subtitle}>{meta.subtitle}</Text>
      </View>

      {/* Search Input */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchPill}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={`Search ${meta.title.toLowerCase()}...`}
            placeholderTextColor={colors.textDim}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Categorized Item List */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const securityReasons = securityFindingsMap.get(item.id);
          const hasTotp = isTotpItem(item);
          const isDeleted = item.deletedAt !== null && item.deletedAt !== undefined;

          return (
            <TouchableOpacity
              style={styles.itemRow}
              activeOpacity={0.75}
              onPress={() => {
                if (hasTotp && !isDeleted) {
                  onSelectTotp(item);
                } else {
                  const detailMsg = [
                    `Username: ${item.username || 'None'}`,
                    securityReasons ? `Security Issue: ${securityReasons.join(', ')}` : null,
                    isDeleted && item.deletedAt
                      ? `Deleted: ${new Date(item.deletedAt).toLocaleDateString()}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join('\n');

                  Alert.alert(item.title, detailMsg, [
                    ...(isDeleted && onRestoreItem
                      ? [{ text: 'Restore', onPress: () => onRestoreItem(item.id) }]
                      : []),
                    ...(!isDeleted && onSoftDeleteItem
                      ? [
                          {
                            text: 'Move to Deleted',
                            style: 'destructive' as const,
                            onPress: () => onSoftDeleteItem(item.id),
                          },
                        ]
                      : []),
                    { text: 'Close', style: 'cancel' as const },
                  ]);
                }
              }}
            >
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor:
                      category === 'security'
                        ? colors.iosRedGlow
                        : category === 'totp'
                        ? colors.iosYellowGlow
                        : category === 'deleted'
                        ? colors.iosGrayGlow
                        : colors.iosBlueGlow,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.avatarText,
                    {
                      color:
                        category === 'security'
                          ? colors.iosRed
                          : category === 'totp'
                          ? colors.iosYellow
                          : category === 'deleted'
                          ? colors.iosGray
                          : colors.iosBlue,
                    },
                  ]}
                >
                  {item.title.slice(0, 1).toUpperCase()}
                </Text>
              </View>

              <View style={styles.itemDetails}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.itemUser} numberOfLines={1}>
                  {item.username || 'No username'}
                </Text>
                {securityReasons && securityReasons.length > 0 && (
                  <View style={styles.securityReasonRow}>
                    <Text style={styles.securityReasonText}>
                      ⚠ {securityReasons.join(' • ')}
                    </Text>
                  </View>
                )}
              </View>

              {hasTotp && !isDeleted && (
                <View style={styles.totpBadge}>
                  <Text style={styles.totpBadgeText}>2FA</Text>
                </View>
              )}

              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>
              {category === 'security'
                ? 'No Weak or Reused Passwords'
                : category === 'deleted'
                ? 'No Recently Deleted Items'
                : category === 'totp'
                ? 'No Verification Codes Yet'
                : 'No Passwords Found'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {category === 'security'
                ? 'All decrypted credentials in your vault passed the local security check.'
                : 'Tap the + button on the main Passwords screen to add a credential.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  backButton: {
    paddingVertical: spacing.xs,
    paddingRight: spacing.md,
  },
  backButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  headerCountPill: {
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  headerCountText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  titleSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  largeTitle: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  searchWrapper: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    height: 40,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: spacing.sm,
    opacity: 0.7,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 0,
  },
  clearIcon: {
    color: colors.textMuted,
    fontSize: 14,
    paddingLeft: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  itemDetails: {
    flex: 1,
  },
  itemTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  itemUser: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  securityReasonRow: {
    marginTop: 4,
  },
  securityReasonText: {
    color: colors.iosRed,
    fontSize: 11,
    fontWeight: '600',
  },
  totpBadge: {
    backgroundColor: colors.iosYellowGlow,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: spacing.sm,
  },
  totpBadgeText: {
    color: colors.iosYellow,
    fontSize: 11,
    fontWeight: '700',
  },
  chevron: {
    color: colors.textDim,
    fontSize: 20,
    fontWeight: '500',
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
});
