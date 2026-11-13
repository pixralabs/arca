/**
 * @file apps/mobile/src/screens/VaultListScreen.tsx
 * @description Categorized Drill-Down List Screen (`VaultListScreen`) with "Apple/Stripe Level"
 * Monochrome + Electric Indigo Aesthetic, Reanimated Spring Transitions, Pill Buttons (minHeight 52),
 * 24px Curvy Cards, Soft Focus-Glow Search Input, >=48x48 Touch Targets, and Tactile Haptics.
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
  Clipboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from '../components/SafeAreaView';
import {
  useTheme,
  spacing,
  radii,
  layout,
  HIT_SLOP,
  AnimatedScreen,
  triggerLightHaptic,
  triggerSuccessHaptic,
} from '../theme/theme';
import { VaultItemPlaintext } from '@vaultguard/shared';
import {
  calculateVaultSecurityScore,
  generatePassword,
} from '@vaultguard/crypto';
import { mobileSaveItem, mobileDecryptItemOnDemand } from '../crypto/mobileCrypto';

export type VaultCategoryFilter = 'all' | 'totp' | 'security' | 'deleted';

export interface MobileVaultItem extends VaultItemPlaintext {
  id: string;
  type?: 'login' | 'totp' | 'note' | 'wifi';
  totpSecret?: string | null;
  customFields?: Array<{ name: string; value: string }>;
  deletedAt?: number | null;
  updatedAt?: number;
  isDecrypted?: boolean;
}

export interface SecurityAuditFinding {
  item: MobileVaultItem;
  reasons: string[];
}

/**
 * Runs a zero-knowledge in-RAM security audit over decrypted items to detect:
 * 1. Weak passwords (< 12 characters or lacking complexity)
 * 2. Commonly compromised dictionary passwords
 * 3. Reused passwords across multiple accounts / URLs
 */
export function evaluateVaultSecurityInRam(items: MobileVaultItem[]): Map<string, string[]> {
  const activeItems = items.filter(
    (item) => item.deletedAt === null || item.deletedAt === undefined
  );
  const auditResult = calculateVaultSecurityScore(activeItems);
  return auditResult.findings;
}

export function isTotpItem(item: MobileVaultItem): boolean {
  return Boolean(item.type === 'totp' || item.totpSecret || item.totpConfig);
}

export interface VaultListScreenProps {
  category: VaultCategoryFilter;
  items: MobileVaultItem[];
  initialSearch?: string;
  onBack: () => void;
  onSelectTotp: (item: MobileVaultItem) => void;
  onSoftDeleteItem?: (itemId: string) => void;
  onRestoreItem?: (itemId: string) => void;
  onItemUpdated?: () => void;
}

export function VaultListScreen({
  category,
  items,
  initialSearch = '',
  onBack,
  onSelectTotp,
  onSoftDeleteItem,
  onRestoreItem,
  onItemUpdated,
}: VaultListScreenProps) {
  const { colors } = useTheme();
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [searchFocused, setSearchFocused] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);

  const categoryMetadata: Record<
    VaultCategoryFilter,
    { title: string; subtitle: string; accentColor: string; glowColor: string }
  > = useMemo(
    () => ({
      all: {
        title: 'All Passwords',
        subtitle: 'Decrypted in RAM • End-to-End Encrypted',
        accentColor: colors.primary,
        glowColor: colors.primaryGlow,
      },
      totp: {
        title: 'Verification Codes',
        subtitle: 'RFC 6238 TOTP 2FA Authenticators',
        accentColor: colors.accentViolet,
        glowColor: colors.accentVioletGlow,
      },
      security: {
        title: 'Security Recommendations',
        subtitle: 'Local in-RAM audit for weak (< 12 chars), lacking complexity, or reused passwords',
        accentColor: colors.danger,
        glowColor: colors.dangerGlow,
      },
      deleted: {
        title: 'Recently Deleted',
        subtitle: 'Tombstoned items pending permanent erasure',
        accentColor: colors.accentZinc,
        glowColor: colors.accentZincGlow,
      },
    }),
    [colors]
  );

  const meta = categoryMetadata[category];

  // In-RAM Security Health Audit on decrypted items
  const decryptedItems = useMemo(
    () => items.filter((item: MobileVaultItem) => item.isDecrypted !== false && Boolean(item.password)),
    [items]
  );
  const securityScoreResult = useMemo(
    () => calculateVaultSecurityScore(decryptedItems),
    [decryptedItems]
  );
  const securityFindingsMap = securityScoreResult.findings;

  // 1-Click Replace with Arca Generator
  const handleReplaceWithArcaGenerator = async (item: MobileVaultItem) => {
    triggerLightHaptic();
    setUpdatingItemId(item.id);
    try {
      let fullItem = item;
      if (!item.isDecrypted) {
        try {
          fullItem = (await mobileDecryptItemOnDemand(item.id)) as MobileVaultItem;
        } catch {}
      }
      const strongPassword = await generatePassword({ length: 20 });
      const updated: MobileVaultItem = {
        ...fullItem,
        password: strongPassword,
        updatedAt: Date.now(),
        isDecrypted: true,
      };
      await mobileSaveItem(updated);
      triggerSuccessHaptic();
      Alert.alert(
        'Password Replaced',
        `Replaced password for "${item.title}" with a strong, high-entropy 20-character generator password.`
      );
      if (onItemUpdated) {
        onItemUpdated();
      }
    } catch {
      Alert.alert('Error', 'Failed to update and encrypt password.');
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleCopyPassword = async (item: MobileVaultItem) => {
    triggerLightHaptic();
    try {
      let fullItem = item;
      if (!item.isDecrypted || !item.password) {
        fullItem = (await mobileDecryptItemOnDemand(item.id)) as MobileVaultItem;
      }
      if (fullItem.password) {
        Clipboard.setString(fullItem.password);
        triggerSuccessHaptic();
        Alert.alert('Copied', `Password for "${fullItem.title}" copied to clipboard.`);
      } else {
        Alert.alert('Notice', 'No password set for this item.');
      }
    } catch {
      Alert.alert('Error', 'Failed to decrypt password.');
    }
  };

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
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Navigation Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              triggerLightHaptic();
              onBack();
            }}
            style={styles.backButton}
            hitSlop={HIT_SLOP}
            activeOpacity={0.7}
          >
            <Text style={[styles.backButtonText, { color: colors.primary }]}>
              ‹ Passwords
            </Text>
          </TouchableOpacity>
          <View
            style={[
              styles.headerCountPill,
              { backgroundColor: colors.surfaceSubtle },
            ]}
          >
            <Text style={[styles.headerCountText, { color: colors.textMuted }]}>
              {category === 'security'
                ? `Score: ${securityScoreResult.score}%`
                : filteredItems.length}
            </Text>
          </View>
        </View>

        {/* Category Title */}
        <View style={styles.titleSection}>
          <Text style={[styles.largeTitle, { color: colors.textHeading }]}>
            {meta.title}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {meta.subtitle}
          </Text>
        </View>

        {/* Security Health Scorecard Banner */}
        {category === 'security' && (
          <View
            style={[
              styles.securityScoreCard,
              {
                backgroundColor: colors.surface,
              },
            ]}
          >
            <View style={styles.securityScoreRow}>
              <View>
                <Text style={[styles.securityScoreLabel, { color: colors.textMuted }]}>
                  Overall Vault Security
                </Text>
                <Text style={[styles.securityScoreValue, { color: colors.textHeading }]}>
                  {securityScoreResult.score}% Safe
                </Text>
              </View>
              <View
                style={[
                  styles.securityRatingBadge,
                  {
                    backgroundColor:
                      securityScoreResult.score >= 80
                        ? colors.primaryGlow
                        : securityScoreResult.score >= 50
                          ? colors.warningGlow
                          : colors.dangerGlow,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.securityRatingText,
                    {
                      color:
                        securityScoreResult.score >= 80
                          ? colors.primary
                          : securityScoreResult.score >= 50
                            ? colors.warning
                            : colors.danger,
                    },
                  ]}
                >
                  {securityScoreResult.rating}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.progressBarBackground,
                { backgroundColor: colors.surfaceSubtle },
              ]}
            >
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${securityScoreResult.score}%`,
                    backgroundColor:
                      securityScoreResult.score >= 80
                        ? colors.primary
                        : securityScoreResult.score >= 50
                          ? colors.warning
                          : colors.danger,
                  },
                ]}
              />
            </View>
          </View>
        )}

        {/* Soft Grey Search Input with Subtle Indigo Focus Glow */}
        <View style={styles.searchWrapper}>
          <View
            style={[
              styles.searchPill,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: searchFocused ? colors.primary : 'transparent',
              },
              searchFocused && {
                shadowColor: colors.primary,
                shadowOpacity: 0.25,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 0 },
              },
            ]}
          >
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={`Search ${meta.title.toLowerCase()}...`}
              placeholderTextColor={colors.textDim}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                style={styles.clearButton}
                hitSlop={HIT_SLOP}
                onPress={() => {
                  triggerLightHaptic();
                  setSearchQuery('');
                }}
              >
                <Text style={[styles.clearIcon, { color: colors.textMuted }]}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Categorized Item List */}
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const securityReasons = securityFindingsMap.get(item.id);
            const hasTotp = isTotpItem(item);
            const isDeleted = item.deletedAt !== null && item.deletedAt !== undefined;
            const isWeak = securityScoreResult.weakItemIds.has(item.id);
            const isReused = securityScoreResult.reusedItemIds.has(item.id);

            return (
              <View
                style={[
                  styles.itemWrapper,
                  {
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.itemRow}
                  activeOpacity={0.78}
                  onPress={async () => {
                    triggerLightHaptic();
                    let fullItem = item;
                    if (!item.isDecrypted) {
                      try {
                        fullItem = (await mobileDecryptItemOnDemand(item.id)) as MobileVaultItem;
                      } catch {}
                    }
                    if (hasTotp && !isDeleted) {
                      onSelectTotp(fullItem);
                    } else {
                      const detailMsg = [
                        `Username: ${fullItem.username || 'None'}`,
                        securityReasons
                          ? `Security Issue:\n• ${securityReasons.join('\n• ')}`
                          : null,
                        isDeleted && fullItem.deletedAt
                          ? `Deleted: ${new Date(fullItem.deletedAt).toLocaleDateString()}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join('\n\n');

                      Alert.alert(fullItem.title, detailMsg, [
                        {
                          text: 'Copy Password',
                          onPress: () => void handleCopyPassword(fullItem),
                        },
                        ...(category === 'security'
                          ? [
                            {
                              text: 'Replace with Arca Generator',
                              onPress: () => void handleReplaceWithArcaGenerator(fullItem),
                            },
                          ]
                          : []),
                        ...(isDeleted && onRestoreItem
                          ? [
                            {
                              text: 'Restore',
                              onPress: () => {
                                triggerLightHaptic();
                                onRestoreItem(fullItem.id);
                              },
                            },
                          ]
                          : []),
                        ...(!isDeleted && onSoftDeleteItem
                          ? [
                            {
                              text: 'Move to Deleted',
                              style: 'destructive' as const,
                              onPress: () => {
                                triggerLightHaptic();
                                onSoftDeleteItem(fullItem.id);
                              },
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
                        backgroundColor: meta.glowColor,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.avatarText,
                        {
                          color: meta.accentColor,
                        },
                      ]}
                    >
                      {item.title.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.itemDetails}>
                    <View style={styles.itemTitleRow}>
                      <Text
                        style={[styles.itemTitle, { color: colors.textHeading }]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      {isWeak && (
                        <View
                          style={[
                            styles.weakBadge,
                            {
                              backgroundColor: colors.dangerGlow,
                              borderColor: colors.dangerBorder,
                            },
                          ]}
                        >
                          <Text style={[styles.weakBadgeText, { color: colors.danger }]}>
                            Weak
                          </Text>
                        </View>
                      )}
                      {isReused && (
                        <View
                          style={[
                            styles.reusedBadge,
                            {
                              backgroundColor: colors.warningGlow,
                              borderColor: colors.warning,
                            },
                          ]}
                        >
                          <Text style={[styles.reusedBadgeText, { color: colors.warning }]}>
                            Reused
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text
                      style={[styles.itemUser, { color: colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {item.username || 'No username'}
                    </Text>
                    {securityReasons && securityReasons.length > 0 && (
                      <View style={styles.securityReasonRow}>
                        <Text style={[styles.securityReasonText, { color: colors.danger }]}>
                          ⚠ {securityReasons.join(' • ')}
                        </Text>
                      </View>
                    )}
                  </View>

                  {hasTotp && !isDeleted && (
                    <View
                      style={[
                        styles.totpBadge,
                        { backgroundColor: colors.primaryGlow },
                      ]}
                    >
                      <Text style={[styles.totpBadgeText, { color: colors.primary }]}>
                        2FA
                      </Text>
                    </View>
                  )}

                  <Text style={[styles.chevron, { color: colors.textDim }]}>›</Text>
                </TouchableOpacity>

                {/* 1-Click Replace with Arca Generator Pill Button */}
                {category === 'security' && (
                  <View style={styles.replaceButtonContainer}>
                    <TouchableOpacity
                      style={[
                        styles.replaceButton,
                        { backgroundColor: colors.primary },
                      ]}
                      activeOpacity={0.85}
                      disabled={updatingItemId === item.id}
                      onPress={() => void handleReplaceWithArcaGenerator(item)}
                    >
                      <Text style={[styles.replaceButtonText, { color: colors.onPrimary }]}>
                        {updatingItemId === item.id
                          ? '⚡ Generating...'
                          : '⚡ Replace with Arca Generator'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyTitle, { color: colors.textHeading }]}>
                {category === 'security'
                  ? 'No Weak or Reused Passwords'
                  : category === 'deleted'
                    ? 'No Recently Deleted Items'
                    : category === 'totp'
                      ? 'No Verification Codes Yet'
                      : 'No Passwords Found'}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                {category === 'security'
                  ? 'All decrypted credentials in your vault meet high-entropy security standards.'
                  : 'Tap the + button on the main Passwords screen to add a credential.'}
              </Text>
            </View>
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    minWidth: layout.minTouchTarget,
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
    paddingRight: spacing.md,
  },
  backButtonText: {
    fontFamily: 'Inter',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  headerCountPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  headerCountText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '700',
  },
  titleSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  largeTitle: {
    fontFamily: 'Inter',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: 'Inter',
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  securityScoreCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card, // 24px curvy surface
  },
  securityScoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  securityScoreLabel: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  securityScoreValue: {
    fontFamily: 'Inter',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  securityRatingBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  securityRatingText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '700',
  },
  progressBarBackground: {
    height: 6,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  searchWrapper: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
    borderWidth: 1.5,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 15,
    paddingVertical: 10,
  },
  clearButton: {
    minWidth: layout.minTouchTarget,
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearIcon: {
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  itemWrapper: {
    marginBottom: spacing.md,
    borderRadius: radii.card, // 24px curvy card
    overflow: 'hidden',
    padding: spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    minHeight: 68,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: '700',
  },
  itemDetails: {
    flex: 1,
    marginRight: spacing.sm,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemTitle: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  weakBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  weakBadgeText: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '700',
  },
  reusedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  reusedBadgeText: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '700',
  },
  itemUser: {
    fontSize: 13,
    fontFamily: 'monospace',
    marginTop: 3,
  },
  securityReasonRow: {
    marginTop: 4,
  },
  securityReasonText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
  },
  totpBadge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radii.pill,
    marginRight: spacing.xs,
  },
  totpBadgeText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 20,
    marginLeft: 4,
  },
  replaceButtonContainer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  replaceButton: {
    borderRadius: radii.pill, // 9999 pill-shaped
    minHeight: layout.minButtonHeight, // >= 52px
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  replaceButtonText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  emptyContainer: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: 'Inter',
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 20,
  },
});