/**
 * @file apps/mobile/src/screens/VaultScreen.tsx
 * @description Arca Mobile — "Apple/Stripe Level" Categorized 2-Column Vault Grid Screen
 * with Strict Monochrome (Pure Black & White) Palette, 24px Curvy Cards, Pill Buttons (minHeight 52),
 * Reanimated Drag-to-Dismiss Bottom Sheets (`Add Item` & `CSV Import`), Keyboard-Aware Scroll Forms,
 * Shimmering Skeleton Loaders while Unlocking/Decrypting, >=48x48 Touch Targets, and Haptic Feedback.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  Alert,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from '../components/SafeAreaView';
import {
  useTheme,
  spacing,
  radii,
  layout,
  HIT_SLOP,
  VaultSkeletonLoader,
  DraggableBottomSheet,
  triggerLightHaptic,
  triggerSuccessHaptic,
} from '../theme/theme';
import {
  mobileGetVaultMetadataItems,
  mobileDecryptItemOnDemand,
  mobileStartBackgroundDecryption,
  mobileSaveItem,
  clearActiveSession,
  getActiveSession,
} from '../crypto/mobileCrypto';
import { softDeleteVaultItem } from '../storage/db';
import { VaultItemPlaintext } from '@vaultguard/shared';
import {
  calculateVaultSecurityScore,
  checkPasswordForSavePrompt,
  generatePassword,
  importCsvBytesWithZeroization,
} from '@vaultguard/crypto';
import {
  VaultListScreen,
  VaultCategoryFilter,
  MobileVaultItem,
  evaluateVaultSecurityInRam,
  isTotpItem,
} from './VaultListScreen';

declare const __DEV__: boolean;

interface VaultScreenProps {
  onLock: () => void;
  onGoToGenerator: () => void;
  onGoToTotp: (item: VaultItemPlaintext) => void;
  onGoToSettings: () => void;
}

interface CategoryTileItem {
  id: 'all' | 'codes' | 'security' | 'deleted' | 'wifi';
  label: string;
  count: number;
  iconSymbol: string;
  iconBgColor: string;
  iconTextColor: string;
  glowColor: string;
  disabled?: boolean;
  subtitleBadge?: string;
}

export function VaultScreen({
  onLock,
  onGoToGenerator,
  onGoToTotp,
  onGoToSettings,
}: VaultScreenProps) {
  const { colors } = useTheme();
  const [items, setItems] = useState<MobileVaultItem[]>([]);
  const [deletedItems, setDeletedItems] = useState<MobileVaultItem[]>([]);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<VaultCategoryFilter | null>(null);

  // Smooth Drag-to-Dismiss Bottom Sheet state for "Add Item"
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [newTitle, setNewTitle] = useState(__DEV__ ? 'GitHub' : '');
  const [newUsername, setNewUsername] = useState(__DEV__ ? 'octocat@github.com' : '');
  const [newPassword, setNewPassword] = useState(__DEV__ ? 'Secret123!' : '');
  const [newTotpSecret, setNewTotpSecret] = useState(__DEV__ ? 'JBSWY3DPEHPK3PXP' : '');
  const [focusedAddField, setFocusedAddField] = useState<
    'title' | 'username' | 'password' | 'totp' | null
  >(null);

  // Smooth Drag-to-Dismiss Bottom Sheet state for CSV Import
  const [showImportSheet, setShowImportSheet] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');
  const [csvFocused, setCsvFocused] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const loadItems = async () => {
    try {
      // 1. Instant metadata query (< 5ms) — renders VaultScreen immediately!
      const metaItems = (await mobileGetVaultMetadataItems(true)) as MobileVaultItem[];
      const active: MobileVaultItem[] = [];
      const tombstoned: MobileVaultItem[] = [];

      for (const entry of metaItems) {
        if (entry.deletedAt !== null && entry.deletedAt !== undefined) {
          tombstoned.push(entry);
        } else {
          active.push(entry);
        }
      }
      setItems(active);
      if (tombstoned.length > 0) {
        setDeletedItems(tombstoned);
      }
      // Turn off loading immediately! Zero delay.
      setLoading(false);

      // 2. Start progressive non-blocking background decryption for security score and search
      void mobileStartBackgroundDecryption((decrypted) => {
        setItems((prev) =>
          prev.map((it) => (it.id === decrypted.id ? ({ ...it, ...decrypted } as MobileVaultItem) : it))
        );
      });
    } catch {
      Alert.alert('Error', 'Failed to read vault items.');
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  const combinedItems = useMemo(
    () => [...items, ...deletedItems],
    [items, deletedItems]
  );

  // In-RAM Precision Security Audit on decrypted items
  const decryptedItems = useMemo(
    () => items.filter((item: MobileVaultItem) => item.isDecrypted !== false && Boolean(item.password)),
    [items]
  );

  const securityAudit = useMemo(
    () => calculateVaultSecurityScore(decryptedItems),
    [decryptedItems]
  );
  const securityFindingsMap = securityAudit.findings;

  const codesCount = useMemo(
    () => items.filter((item: MobileVaultItem) => isTotpItem(item)).length,
    [items]
  );

  const categoryTiles: CategoryTileItem[] = useMemo(
    () => [
      {
        id: 'all',
        label: 'All',
        count: items.length,
        iconSymbol: '🔑',
        iconBgColor: colors.primary,
        iconTextColor: colors.onPrimary,
        glowColor: colors.primaryGlow,
      },
      {
        id: 'codes',
        label: 'Codes',
        count: codesCount,
        iconSymbol: '⏱',
        iconBgColor: colors.accentViolet,
        iconTextColor: colors.onPrimary,
        glowColor: colors.accentVioletGlow,
      },
      {
        id: 'security',
        label: 'Security',
        count: securityAudit.weakCount + securityAudit.reusedCount,
        iconSymbol: '!',
        iconBgColor:
          securityAudit.score >= 80
            ? colors.primary
            : securityAudit.score >= 50
              ? colors.warning
              : colors.danger,
        iconTextColor: colors.onPrimary,
        glowColor:
          securityAudit.score >= 80
            ? colors.primaryGlow
            : securityAudit.score >= 50
              ? colors.warningGlow
              : colors.dangerGlow,
        subtitleBadge: `Score: ${securityAudit.score}%`,
      },
      {
        id: 'deleted',
        label: 'Deleted',
        count: deletedItems.length,
        iconSymbol: '🗑',
        iconBgColor: colors.accentZinc,
        iconTextColor: colors.onPrimary,
        glowColor: colors.accentZincGlow,
      },
      {
        id: 'wifi',
        label: 'Wi-Fi',
        count: 0,
        iconSymbol: '🛜',
        iconBgColor: colors.surfaceSubtle,
        iconTextColor: colors.textDim,
        glowColor: colors.accentZincGlow,
        disabled: true,
        subtitleBadge: 'Coming Soon',
      },
    ],
    [items.length, codesCount, securityAudit, deletedItems.length, colors]
  );

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return items.filter(
      (item: MobileVaultItem) =>
        item.title.toLowerCase().includes(q) ||
        (item.username && item.username.toLowerCase().includes(q)) ||
        (item.urls && item.urls.some((u: string) => u.toLowerCase().includes(q)))
    );
  }, [items, search]);

  const handleTilePress = (tile: CategoryTileItem) => {
    triggerLightHaptic();
    if (tile.disabled || tile.id === 'wifi') {
      Alert.alert(
        'Wi-Fi Passwords',
        'Encrypted Wi-Fi network sharing is coming in a future update.'
      );
      return;
    }
    if (tile.id === 'all') {
      setActiveCategory('all');
    } else if (tile.id === 'codes') {
      setActiveCategory('totp');
    } else if (tile.id === 'security') {
      setActiveCategory('security');
    } else if (tile.id === 'deleted') {
      setActiveCategory('deleted');
    }
  };

  const executeSaveNewItem = async (passwordToSave: string) => {
    try {
      const created: MobileVaultItem = {
        id: 'item_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        title: newTitle.trim(),
        username: newUsername.trim(),
        password: passwordToSave,
        urls: [],
        notes: '',
        totpSecret: newTotpSecret.trim() ? newTotpSecret.trim() : null,
        totpConfig: newTotpSecret.trim()
          ? {
            secret: newTotpSecret.trim(),
            period: 30,
            digits: 6,
            algorithm: 'SHA1',
          }
          : undefined,
        type: newTotpSecret.trim() ? 'totp' : 'login',
        customFields: [],
        updatedAt: Date.now(),
        deletedAt: null,
        isDecrypted: true,
      };
      await mobileSaveItem(created);
      triggerSuccessHaptic();
      setNewTitle('');
      setNewUsername('');
      setNewPassword('');
      setNewTotpSecret('');
      setShowAddSheet(false);
      await loadItems();
    } catch {
      Alert.alert('Error', 'Failed to encrypt and save credential.');
    }
  };

  const handleSaveNewItem = async () => {
    triggerLightHaptic();
    if (!newTitle.trim()) {
      Alert.alert('Missing Title', 'Please enter a website or service name.');
      return;
    }

    const auditCheck = checkPasswordForSavePrompt(newPassword, '', items);
    if (auditCheck.warningMessage) {
      Alert.alert(
        'Save this existing password to Arca?',
        auditCheck.warningMessage,
        [
          {
            text: 'Save Anyway',
            onPress: () => void executeSaveNewItem(newPassword),
          },
          {
            text: 'Replace with Arca Generator',
            onPress: async () => {
              const strong = await generatePassword({ length: 20 });
              setNewPassword(strong);
              await executeSaveNewItem(strong);
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    await executeSaveNewItem(newPassword);
  };

  const handleExecuteCsvImport = async () => {
    triggerLightHaptic();
    if (!importCsvText.trim()) {
      Alert.alert('Empty CSV', 'Please paste the contents of your CSV file.');
      return;
    }
    setIsImporting(true);
    try {
      const encoder = new TextEncoder();
      const csvBytes = encoder.encode(importCsvText);

      const result = await importCsvBytesWithZeroization(csvBytes);
      for (const item of result.plaintexts) {
        await mobileSaveItem({
          ...item,
          id: 'item_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        });
      }
      triggerSuccessHaptic();
      setImportCsvText('');
      setShowImportSheet(false);
      await loadItems();
      Alert.alert(
        'Import Complete',
        `Successfully imported ${result.plaintexts.length} credentials!\n• Weak: ${result.audit.weakCount}\n• Reused: ${result.audit.reusedCount}`
      );
    } catch (err: any) {
      Alert.alert('Import Failed', err?.message || 'Invalid CSV format');
    } finally {
      setIsImporting(false);
    }
  };

  const handleSoftDelete = (itemId: string) => {
    triggerLightHaptic();
    const target = items.find((i: MobileVaultItem) => i.id === itemId);
    if (!target) return;
    const now = Date.now();
    try {
      softDeleteVaultItem(itemId, `${now}:0000:mobile`);
    } catch {
      // Ignore if in-memory session
    }
    setItems((prev: MobileVaultItem[]) => prev.filter((i: MobileVaultItem) => i.id !== itemId));
    setDeletedItems((prev: MobileVaultItem[]) => [{ ...target, deletedAt: now }, ...prev]);
  };

  const handleRestoreDeleted = (itemId: string) => {
    triggerLightHaptic();
    const target = deletedItems.find((i: MobileVaultItem) => i.id === itemId);
    if (!target) return;
    setDeletedItems((prev: MobileVaultItem[]) => prev.filter((i: MobileVaultItem) => i.id !== itemId));
    setItems((prev: MobileVaultItem[]) => [{ ...target, deletedAt: null }, ...prev]);
  };

  const handleLockVault = () => {
    triggerLightHaptic();
    clearActiveSession();
    onLock();
  };

  const handleTopMoreMenu = () => {
    triggerLightHaptic();
    Alert.alert('Vault Actions', 'Choose an action:', [
      { text: '🔒 Lock Vault', style: 'destructive', onPress: handleLockVault },
      { text: '📥 Import Passwords (CSV)', onPress: () => setShowImportSheet(true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Drill-down to VaultListScreen when a category tile is tapped
  if (activeCategory !== null) {
    return (
      <VaultListScreen
        category={activeCategory}
        items={combinedItems}
        onBack={() => {
          triggerLightHaptic();
          setActiveCategory(null);
        }}
        onSelectTotp={(item) => {
          triggerLightHaptic();
          onGoToTotp(item);
        }}
        onSoftDeleteItem={handleSoftDelete}
        onRestoreItem={handleRestoreDeleted}
        onItemUpdated={loadItems}
      />
    );
  }

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {/* Top Bar with Quick Action Pills & Circular More Menu */}
      <View style={styles.topUtilityBar}>
        <View style={styles.quickActionGroup}>
          <TouchableOpacity
            style={[styles.utilityPill, { backgroundColor: colors.surface }]}
            hitSlop={HIT_SLOP}
            onPress={() => {
              triggerLightHaptic();
              setShowImportSheet(true);
            }}
            activeOpacity={0.75}
          >
            <Text style={[styles.utilityPillText, { color: colors.textMuted }]}>
              📥 Import
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.utilityPill, { backgroundColor: colors.surface }]}
            hitSlop={HIT_SLOP}
            onPress={() => {
              triggerLightHaptic();
              onGoToGenerator();
            }}
            activeOpacity={0.75}
          >
            <Text style={[styles.utilityPillText, { color: colors.textMuted }]}>
              ⚡ Generator
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.utilityPill, { backgroundColor: colors.surface }]}
            hitSlop={HIT_SLOP}
            onPress={handleLockVault}
            activeOpacity={0.75}
          >
            <Text style={[styles.utilityPillText, { color: colors.textMuted }]}>
              🔒 Lock
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.utilityPill, { backgroundColor: colors.surface }]}
            hitSlop={HIT_SLOP}
            onPress={() => {
              triggerLightHaptic();
              onGoToSettings();
            }}
            activeOpacity={0.75}
          >
            <Text style={[styles.utilityPillText, { color: colors.textMuted }]}>
              ⚙ Settings
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.moreCircleButton, { backgroundColor: colors.surface }]}
          hitSlop={HIT_SLOP}
          onPress={handleTopMoreMenu}
          activeOpacity={0.75}
          accessibilityLabel="More options"
        >
          <Text style={[styles.moreCircleDots, { color: colors.text }]}>•••</Text>
        </TouchableOpacity>
      </View>

      {/* Large "Passwords" Heading + Vault Badge */}
      <View style={styles.headerTitleContainer}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[styles.largeHeaderTitle, { color: colors.textHeading }]}>
            Passwords
          </Text>
          {getActiveSession()?.vaultName && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surfaceSubtle,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Inter',
                  fontSize: 12,
                  fontWeight: '600',
                  color: colors.textMuted,
                }}
              >
                {getActiveSession()?.vaultName}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Show Shimmering Skeletons while Vault is Decrypting */}
      {loading && items.length === 0 ? (
        <VaultSkeletonLoader />
      ) : (
        <>
          {/* Security Scorecard Banner */}
          {items.length > 0 && search.trim().length === 0 && (
            <TouchableOpacity
              style={[
                styles.securityScoreHeaderCard,
                {
                  backgroundColor: colors.surface,
                },
              ]}
              activeOpacity={0.8}
              onPress={() => {
                triggerLightHaptic();
                setActiveCategory('security');
              }}
            >
              <View style={styles.securityScoreHeaderRow}>
                <View style={styles.securityScoreHeaderLeft}>
                  <View
                    style={[
                      styles.securityShieldCircle,
                      {
                        backgroundColor:
                          securityAudit.score >= 80
                            ? colors.primaryGlow
                            : securityAudit.score >= 50
                              ? colors.warningGlow
                              : colors.dangerGlow,
                      },
                    ]}
                  >
                    <Text style={styles.securityShieldText}>
                      {securityAudit.score >= 80 ? '🛡' : '⚠'}
                    </Text>
                  </View>
                  <View style={{ flexShrink: 1 }}>
                    <Text
                      style={[
                        styles.securityScoreTitle,
                        { color: colors.textHeading },
                      ]}
                    >
                      Vault Security Score
                    </Text>
                    <Text
                      style={[
                        styles.securityScoreSubtitle,
                        { color: colors.textMuted },
                      ]}
                      numberOfLines={1}
                    >
                      {securityAudit.weakCount > 0 || securityAudit.reusedCount > 0
                        ? `${securityAudit.weakCount} Weak • ${securityAudit.reusedCount} Reused`
                        : 'All Passwords Strong & Unique'}
                    </Text>
                  </View>
                </View>

                <View style={styles.securityScoreHeaderRight}>
                  <Text
                    style={[
                      styles.securityScoreValueText,
                      {
                        color:
                          securityAudit.score >= 80
                            ? colors.primary
                            : securityAudit.score >= 50
                              ? colors.warning
                              : colors.danger,
                      },
                    ]}
                  >
                    {securityAudit.score}%
                  </Text>
                  <Text style={[styles.securityChevron, { color: colors.textDim }]}>
                    ›
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* Live Filtered Search Results OR 2-Column Curvy Category Grid */}
          {search.trim().length > 0 ? (
            <FlatList
              key="search-results-list"
              data={searchResults}
              keyExtractor={(item: MobileVaultItem) => item.id}
              contentContainerStyle={styles.searchListContent}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }: { item: MobileVaultItem }) => {
                const hasTotp = isTotpItem(item);
                const secReasons = securityFindingsMap.get(item.id);
                return (
                  <TouchableOpacity
                    style={[
                      styles.searchItemCard,
                      { backgroundColor: colors.surface },
                    ]}
                    activeOpacity={0.78}
                    onPress={() => {
                      triggerLightHaptic();
                      if (hasTotp) {
                        onGoToTotp(item);
                      } else {
                        Alert.alert(
                          item.title,
                          `Username: ${item.username || 'None'}`,
                          [
                            ...(item.password
                              ? [
                                {
                                  text: 'Copy Password',
                                  onPress: () => {
                                    triggerLightHaptic();
                                    Clipboard.setString(item.password);
                                  },
                                },
                              ]
                              : []),
                            { text: 'Close', style: 'cancel' },
                          ]
                        );
                      }
                    }}
                  >
                    <View
                      style={[
                        styles.searchItemAvatar,
                        { backgroundColor: colors.primaryGlow },
                      ]}
                    >
                      <Text
                        style={[
                          styles.searchItemAvatarText,
                          { color: colors.primary },
                        ]}
                      >
                        {item.title.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.searchItemDetails}>
                      <Text
                        style={[
                          styles.searchItemTitle,
                          { color: colors.textHeading },
                        ]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      <Text
                        style={[
                          styles.searchItemUser,
                          { color: colors.textMuted },
                        ]}
                        numberOfLines={1}
                      >
                        {item.username || 'No username'}
                      </Text>
                      {secReasons && (
                        <Text
                          style={[
                            styles.searchItemWarning,
                            { color: colors.danger },
                          ]}
                        >
                          ⚠ {secReasons[0]}
                        </Text>
                      )}
                    </View>
                    {hasTotp && (
                      <View
                        style={[
                          styles.totpBadge,
                          { backgroundColor: colors.primaryGlow },
                        ]}
                      >
                        <Text
                          style={[styles.totpBadgeText, { color: colors.primary }]}
                        >
                          2FA
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptySearchContainer}>
                  <Text style={[styles.emptySearchText, { color: colors.textDim }]}>
                    {loading ? 'Decrypting vault...' : `No matches for "${search}"`}
                  </Text>
                </View>
              }
            />
          ) : (
            <FlatList
              key="category-grid-2col"
              data={categoryTiles}
              numColumns={2}
              keyExtractor={(tile: CategoryTileItem) => tile.id}
              columnWrapperStyle={styles.gridColumnWrapper}
              contentContainerStyle={styles.gridContentContainer}
              renderItem={({ item: tile }: { item: CategoryTileItem }) => (
                <TouchableOpacity
                  style={[
                    styles.categoryTile,
                    { backgroundColor: colors.surface },
                    tile.disabled && styles.categoryTileDisabled,
                  ]}
                  activeOpacity={tile.disabled ? 0.9 : 0.75}
                  onPress={() => handleTilePress(tile)}
                >
                  <View style={styles.tileTopRow}>
                    <View
                      style={[
                        styles.tileIconGlowWrapper,
                        { backgroundColor: tile.glowColor },
                      ]}
                    >
                      <View
                        style={[
                          styles.tileIconCircle,
                          { backgroundColor: tile.iconBgColor },
                        ]}
                      >
                        <Text
                          style={[
                            styles.tileIconText,
                            { color: tile.iconTextColor },
                          ]}
                        >
                          {tile.iconSymbol}
                        </Text>
                      </View>
                    </View>

                    <Text
                      style={[
                        styles.tileCountText,
                        { color: colors.textMuted },
                        tile.disabled && { color: colors.textDim, fontSize: 18 },
                      ]}
                    >
                      {tile.disabled ? '—' : tile.count}
                    </Text>
                  </View>

                  <View style={styles.tileBottomRow}>
                    <Text
                      style={[
                        styles.tileLabelText,
                        { color: colors.textHeading },
                        tile.disabled && { color: colors.textMuted },
                      ]}
                      numberOfLines={1}
                    >
                      {tile.label}
                    </Text>
                    {tile.subtitleBadge && (
                      <Text
                        style={[styles.tileComingSoon, { color: colors.textDim }]}
                      >
                        {tile.subtitleBadge}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </>
      )}

      {/* Persistent Floating Bottom Bar (Folder Button + Soft Search Pill + Electric Indigo '+' Pill Button) */}
      <View
        style={[
          styles.bottomBarContainer,
          { backgroundColor: colors.floatingBar },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.bottomCircleButton,
            { backgroundColor: colors.surface },
          ]}
          hitSlop={HIT_SLOP}
          activeOpacity={0.75}
          onPress={() => {
            triggerLightHaptic();
            setActiveCategory('all');
          }}
          accessibilityLabel="Browse all folders and items"
        >
          <Text style={styles.bottomFolderIcon}>📁</Text>
        </TouchableOpacity>

        <View
          style={[
            styles.bottomSearchPill,
            {
              backgroundColor: colors.surface,
              borderColor: searchFocused ? colors.primary : 'transparent',
            },
            searchFocused && {
              shadowColor: colors.primary,
              shadowOpacity: 0.28,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 0 },
            },
          ]}
        >
          <Text style={styles.bottomSearchIcon}>🔍</Text>
          <TextInput
            style={[styles.bottomSearchInput, { color: colors.text }]}
            placeholder="Search"
            placeholderTextColor={colors.textDim}
            value={search}
            onChangeText={setSearch}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            autoCapitalize="none"
          />
          {search.length > 0 ? (
            <TouchableOpacity
              hitSlop={HIT_SLOP}
              onPress={() => {
                triggerLightHaptic();
                setSearch('');
              }}
            >
              <Text style={[styles.bottomClearText, { color: colors.textMuted }]}>
                ✕
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.bottomMicIcon}>🎙</Text>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.bottomAddCircleButton,
            { backgroundColor: colors.primary },
          ]}
          hitSlop={HIT_SLOP}
          activeOpacity={0.85}
          onPress={() => {
            triggerLightHaptic();
            setShowAddSheet(true);
          }}
          accessibilityLabel="Add new password"
        >
          <Text style={[styles.bottomAddPlusText, { color: colors.onPrimary }]}>
            +
          </Text>
        </TouchableOpacity>
      </View>

      {/* Drag-to-Dismiss Reanimated Bottom Sheet for "Add Item" */}
      <DraggableBottomSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
      >
        <View
          style={[
            styles.sheetHeaderRow,
            { borderBottomColor: colors.border },
          ]}
        >
          <TouchableOpacity
            style={styles.sheetHeaderAction}
            hitSlop={HIT_SLOP}
            onPress={() => {
              triggerLightHaptic();
              setShowAddSheet(false);
            }}
          >
            <Text style={[styles.sheetCancelText, { color: colors.textMuted }]}>
              Cancel
            </Text>
          </TouchableOpacity>
          <Text style={[styles.sheetHeaderTitle, { color: colors.textHeading }]}>
            New Password
          </Text>
          <TouchableOpacity
            style={styles.sheetHeaderAction}
            hitSlop={HIT_SLOP}
            onPress={handleSaveNewItem}
          >
            <Text style={[styles.sheetSaveText, { color: colors.primary }]}>
              Save
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.sheetScrollForm}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.sheetFieldLabel, { color: colors.textMuted }]}>
            Website or Label
          </Text>
          <TextInput
            style={[
              styles.sheetInput,
              {
                backgroundColor: colors.surfaceSubtle,
                color: colors.text,
                borderColor:
                  focusedAddField === 'title' ? colors.primary : 'transparent',
              },
            ]}
            placeholder="e.g. GitHub, Apple, Stripe"
            placeholderTextColor={colors.textDim}
            value={newTitle}
            onChangeText={setNewTitle}
            onFocus={() => setFocusedAddField('title')}
            onBlur={() => setFocusedAddField(null)}
          />

          <Text style={[styles.sheetFieldLabel, { color: colors.textMuted }]}>
            Username or Email
          </Text>
          <TextInput
            style={[
              styles.sheetInput,
              {
                backgroundColor: colors.surfaceSubtle,
                color: colors.text,
                borderColor:
                  focusedAddField === 'username' ? colors.primary : 'transparent',
              },
            ]}
            placeholder="name@example.com"
            placeholderTextColor={colors.textDim}
            value={newUsername}
            onChangeText={setNewUsername}
            onFocus={() => setFocusedAddField('username')}
            onBlur={() => setFocusedAddField(null)}
            autoCapitalize="none"
          />

          <Text style={[styles.sheetFieldLabel, { color: colors.textMuted }]}>
            Password
          </Text>
          <TextInput
            style={[
              styles.sheetInput,
              {
                backgroundColor: colors.surfaceSubtle,
                color: colors.text,
                borderColor:
                  focusedAddField === 'password' ? colors.primary : 'transparent',
              },
            ]}
            placeholder="Enter strong password..."
            placeholderTextColor={colors.textDim}
            value={newPassword}
            onChangeText={setNewPassword}
            onFocus={() => setFocusedAddField('password')}
            onBlur={() => setFocusedAddField(null)}
            secureTextEntry
            autoCapitalize="none"
          />

          <Text style={[styles.sheetFieldLabel, { color: colors.textMuted }]}>
            2FA / TOTP Secret (Optional)
          </Text>
          <TextInput
            style={[
              styles.sheetInput,
              {
                backgroundColor: colors.surfaceSubtle,
                color: colors.text,
                borderColor:
                  focusedAddField === 'totp' ? colors.primary : 'transparent',
              },
            ]}
            placeholder="Base32 secret or otpauth:// URI"
            placeholderTextColor={colors.textDim}
            value={newTotpSecret}
            onChangeText={setNewTotpSecret}
            onFocus={() => setFocusedAddField('totp')}
            onBlur={() => setFocusedAddField(null)}
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={[
              styles.sheetPrimaryPillButton,
              { backgroundColor: colors.primary },
            ]}
            onPress={handleSaveNewItem}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.sheetPrimaryPillButtonText,
                { color: colors.onPrimary },
              ]}
            >
              Save Credential
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </DraggableBottomSheet>

      {/* Drag-to-Dismiss Reanimated Bottom Sheet for Bulk CSV Import */}
      <DraggableBottomSheet
        visible={showImportSheet}
        onClose={() => setShowImportSheet(false)}
      >
        <View
          style={[
            styles.sheetHeaderRow,
            { borderBottomColor: colors.border },
          ]}
        >
          <TouchableOpacity
            style={styles.sheetHeaderAction}
            hitSlop={HIT_SLOP}
            onPress={() => {
              triggerLightHaptic();
              setShowImportSheet(false);
            }}
          >
            <Text style={[styles.sheetCancelText, { color: colors.textMuted }]}>
              Cancel
            </Text>
          </TouchableOpacity>
          <Text style={[styles.sheetHeaderTitle, { color: colors.textHeading }]}>
            Import Passwords (.csv)
          </Text>
          <TouchableOpacity
            style={styles.sheetHeaderAction}
            hitSlop={HIT_SLOP}
            onPress={handleExecuteCsvImport}
            disabled={isImporting}
          >
            <Text
              style={[
                styles.sheetSaveText,
                { color: colors.primary },
                isImporting && { opacity: 0.5 },
              ]}
            >
              {isImporting ? 'Importing...' : 'Import'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.sheetScrollForm}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.csvWarningBox,
              {
                backgroundColor: colors.primaryGlow,
                borderColor: colors.primaryBorderGlow,
              },
            ]}
          >
            <Text style={[styles.csvWarningText, { color: colors.primary }]}>
              🔒 Your CSV file is processed entirely on-device. It is never uploaded to any server.
            </Text>
          </View>

          <Text style={[styles.sheetFieldLabel, { color: colors.textMuted }]}>
            Paste CSV Data (Chrome, Bitwarden, or 1Password)
          </Text>
          <TextInput
            style={[
              styles.csvTextInput,
              {
                backgroundColor: colors.surfaceSubtle,
                color: colors.text,
                borderColor: csvFocused ? colors.primary : 'transparent',
              },
            ]}
            placeholder="Paste CSV text here..."
            placeholderTextColor={colors.textDim}
            value={importCsvText}
            onChangeText={setImportCsvText}
            onFocus={() => setCsvFocused(true)}
            onBlur={() => setCsvFocused(false)}
            multiline
            numberOfLines={8}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={[styles.csvNoticeText, { color: colors.textDim }]}>
            Data is encrypted directly into your local database in volatile RAM. All buffers are wiped with sodium.memzero() immediately upon import.
          </Text>

          <TouchableOpacity
            style={[
              styles.sheetPrimaryPillButton,
              { backgroundColor: colors.primary },
              isImporting && { opacity: 0.5 },
            ]}
            onPress={handleExecuteCsvImport}
            disabled={isImporting}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.sheetPrimaryPillButtonText,
                { color: colors.onPrimary },
              ]}
            >
              {isImporting ? 'Importing Credentials...' : 'Encrypt & Import CSV'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </DraggableBottomSheet>
    </SafeAreaView>
  );
}

export { VaultListScreen };

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topUtilityBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  quickActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  utilityPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
    borderRadius: radii.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  utilityPillText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
  },
  moreCircleButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: radii.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreCircleDots: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerTitleContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  largeHeaderTitle: {
    fontFamily: 'Inter',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  gridContentContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 120,
  },
  gridColumnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  categoryTile: {
    width: '48.2%',
    borderRadius: radii.card, // 24px curvy card
    paddingHorizontal: 18,
    paddingVertical: 16,
    minHeight: 112,
    justifyContent: 'space-between',
  },
  categoryTileDisabled: {
    opacity: 0.58,
  },
  tileTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tileIconGlowWrapper: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileIconCircle: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileIconText: {
    fontFamily: 'Inter',
    fontSize: 17,
    fontWeight: '800',
  },
  tileCountText: {
    fontFamily: 'Inter',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  tileBottomRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tileLabelText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  tileComingSoon: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  /* Search Results when typing in bottom search bar */
  searchListContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
  },
  searchItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.card, // 24px curvy card
    padding: spacing.lg,
    marginBottom: spacing.sm + 2,
  },
  searchItemAvatar: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  searchItemAvatarText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
  },
  searchItemDetails: {
    flex: 1,
  },
  searchItemTitle: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  searchItemUser: {
    fontFamily: 'Inter',
    fontSize: 13,
    marginTop: 2,
  },
  searchItemWarning: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
  totpBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  totpBadgeText: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '700',
  },
  emptySearchContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptySearchText: {
    fontFamily: 'Inter',
    fontSize: 14,
  },
  /* Persistent Floating Bottom Bar */
  bottomBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: 12,
  },
  bottomCircleButton: {
    width: layout.minButtonHeight, // 52px pill/circle button
    height: layout.minButtonHeight,
    borderRadius: radii.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomFolderIcon: {
    fontSize: 18,
  },
  bottomSearchPill: {
    flex: 1,
    minHeight: layout.minButtonHeight, // 52px pill search bar
    borderRadius: radii.pill,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  bottomSearchIcon: {
    fontSize: 14,
    marginRight: 8,
    opacity: 0.75,
  },
  bottomSearchInput: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 16,
    paddingVertical: 0,
  },
  bottomMicIcon: {
    fontSize: 14,
    opacity: 0.7,
    marginLeft: 6,
  },
  bottomClearText: {
    fontSize: 15,
    paddingLeft: 8,
  },
  bottomAddCircleButton: {
    width: layout.minButtonHeight, // 52px pill/circle button
    height: layout.minButtonHeight,
    borderRadius: radii.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomAddPlusText: {
    fontFamily: 'Inter',
    fontSize: 26,
    fontWeight: '600',
    lineHeight: 28,
  },
  /* Bottom Sheet Content */
  sheetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  sheetHeaderAction: {
    minWidth: layout.minTouchTarget,
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
  },
  sheetCancelText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '500',
  },
  sheetHeaderTitle: {
    fontFamily: 'Inter',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  sheetSaveText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
  },
  sheetScrollForm: {
    marginTop: spacing.sm,
  },
  sheetFieldLabel: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  sheetInput: {
    fontFamily: 'Inter',
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 15,
    borderWidth: 1.5,
  },
  sheetPrimaryPillButton: {
    borderRadius: radii.pill, // 9999 pill-shaped
    minHeight: layout.minButtonHeight, // >= 52px
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sheetPrimaryPillButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  securityScoreHeaderCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card, // 24px curvy card
  },
  securityScoreHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  securityScoreHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  securityShieldCircle: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityShieldText: {
    fontSize: 18,
  },
  securityScoreTitle: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  securityScoreSubtitle: {
    fontFamily: 'Inter',
    fontSize: 13,
    marginTop: 2,
  },
  securityScoreHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  securityScoreValueText: {
    fontFamily: 'Inter',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  securityChevron: {
    fontSize: 20,
  },
  csvWarningBox: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  csvWarningText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  csvTextInput: {
    borderRadius: radii.lg,
    padding: spacing.md,
    fontSize: 13,
    borderWidth: 1.5,
    minHeight: 120,
    textAlignVertical: 'top',
    fontFamily: 'monospace',
  },
  csvNoticeText: {
    fontFamily: 'Inter',
    fontSize: 11,
    marginTop: 8,
    lineHeight: 16,
  },
});