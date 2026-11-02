/**
 * @file apps/mobile/src/screens/VaultScreen.tsx
 * @description Arca Mobile — Apple iOS 18 Passwords-inspired Categorized 2-Column Grid Screen (`#09090b` background,
 * `#18181b` tiles, vibrant circular icons, top-right counts, persistent floating bottom search bar + circular `+` button)
 * with drill-down navigation to `VaultListScreen` (`All`, `Codes`, `Security`, `Deleted`).
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  Alert,
} from 'react-native';
import { colors, spacing, radii } from '../theme/theme';
import {
  mobileGetDecryptedItems,
  mobileSaveItem,
  clearActiveSession,
} from '../crypto/mobileCrypto';
import { softDeleteVaultItem } from '../storage/db';
import { VaultItemPlaintext } from '@vaultguard/shared';
import {
  VaultListScreen,
  VaultCategoryFilter,
  MobileVaultItem,
  evaluateVaultSecurityInRam,
  isTotpItem,
} from './VaultListScreen';

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
  const [items, setItems] = useState<MobileVaultItem[]>([]);
  const [deletedItems, setDeletedItems] = useState<MobileVaultItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<VaultCategoryFilter | null>(null);

  // Cross-platform Add Item Modal state (works on both Android & iOS)
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newTotpSecret, setNewTotpSecret] = useState('');

  const loadItems = async () => {
    setLoading(true);
    try {
      const list = (await mobileGetDecryptedItems()) as MobileVaultItem[];
      const active: MobileVaultItem[] = [];
      const tombstoned: MobileVaultItem[] = [];

      for (const entry of list) {
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
    } catch {
      Alert.alert('Error', 'Failed to read vault items.');
    } finally {
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

  // In-RAM Security Audit (< 8 chars, common passwords, or reused passwords)
  const securityFindingsMap = useMemo(
    () => evaluateVaultSecurityInRam(items),
    [items]
  );

  const codesCount = useMemo(
    () => items.filter((item) => isTotpItem(item)).length,
    [items]
  );

  const categoryTiles: CategoryTileItem[] = useMemo(
    () => [
      {
        id: 'all',
        label: 'All',
        count: items.length,
        iconSymbol: '🔑',
        iconBgColor: colors.iosBlue,
        iconTextColor: '#ffffff',
        glowColor: colors.iosBlueGlow,
      },
      {
        id: 'codes',
        label: 'Codes',
        count: codesCount,
        iconSymbol: '⏱',
        iconBgColor: colors.iosYellow,
        iconTextColor: '#09090b',
        glowColor: colors.iosYellowGlow,
      },
      {
        id: 'security',
        label: 'Security',
        count: securityFindingsMap.size,
        iconSymbol: '!',
        iconBgColor: colors.iosRed,
        iconTextColor: '#ffffff',
        glowColor: colors.iosRedGlow,
      },
      {
        id: 'deleted',
        label: 'Deleted',
        count: deletedItems.length,
        iconSymbol: '🗑',
        iconBgColor: colors.iosGray,
        iconTextColor: '#ffffff',
        glowColor: colors.iosGrayGlow,
      },
      {
        id: 'wifi',
        label: 'Wi-Fi',
        count: 0,
        iconSymbol: '🛜',
        iconBgColor: '#27272a',
        iconTextColor: colors.textDim,
        glowColor: 'rgba(63, 63, 70, 0.15)',
        disabled: true,
        subtitleBadge: 'Coming Soon',
      },
    ],
    [items.length, codesCount, securityFindingsMap.size, deletedItems.length]
  );

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.username && item.username.toLowerCase().includes(q)) ||
        (item.urls && item.urls.some((u) => u.toLowerCase().includes(q)))
    );
  }, [items, search]);

  const handleTilePress = (tile: CategoryTileItem) => {
    if (tile.disabled || tile.id === 'wifi') {
      Alert.alert('Wi-Fi Passwords', 'Encrypted Wi-Fi network sharing is coming in a future update.');
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

  const handleSaveNewItem = async () => {
    if (!newTitle.trim()) {
      Alert.alert('Missing Title', 'Please enter a website or service name.');
      return;
    }
    try {
      const created: MobileVaultItem = {
        id: 'item_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        title: newTitle.trim(),
        username: newUsername.trim(),
        password: newPassword,
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
      };
      await mobileSaveItem(created);
      setNewTitle('');
      setNewUsername('');
      setNewPassword('');
      setNewTotpSecret('');
      setShowAddModal(false);
      await loadItems();
    } catch {
      Alert.alert('Error', 'Failed to encrypt and save credential.');
    }
  };

  const handleSoftDelete = (itemId: string) => {
    const target = items.find((i) => i.id === itemId);
    if (!target) return;
    const now = Date.now();
    try {
      softDeleteVaultItem(itemId, `${now}:0000:mobile`);
    } catch {
      // Ignore if in-memory session
    }
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    setDeletedItems((prev) => [{ ...target, deletedAt: now }, ...prev]);
  };

  const handleRestoreDeleted = (itemId: string) => {
    const target = deletedItems.find((i) => i.id === itemId);
    if (!target) return;
    setDeletedItems((prev) => prev.filter((i) => i.id !== itemId));
    setItems((prev) => [{ ...target, deletedAt: null }, ...prev]);
  };

  const handleLockVault = () => {
    clearActiveSession();
    onLock();
  };

  const handleTopMoreMenu = () => {
    Alert.alert('Vault Actions', 'Choose an action:', [
      { text: 'Password Generator', onPress: onGoToGenerator },
      { text: 'Sync & Security Settings', onPress: onGoToSettings },
      { text: 'Lock Vault', style: 'destructive', onPress: handleLockVault },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Drill-down to VaultListScreen when a category tile is tapped
  if (activeCategory !== null) {
    return (
      <VaultListScreen
        category={activeCategory}
        items={combinedItems}
        onBack={() => setActiveCategory(null)}
        onSelectTotp={(item) => onGoToTotp(item)}
        onSoftDeleteItem={handleSoftDelete}
        onRestoreItem={handleRestoreDeleted}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Bar with iOS 18 Circular More Menu & Quick Action Pills */}
      <View style={styles.topUtilityBar}>
        <View style={styles.quickActionGroup}>
          <TouchableOpacity
            style={styles.utilityPill}
            onPress={onGoToGenerator}
            activeOpacity={0.75}
          >
            <Text style={styles.utilityPillText}>⚡ Generator</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.utilityPill}
            onPress={onGoToSettings}
            activeOpacity={0.75}
          >
            <Text style={styles.utilityPillText}>⚙ Settings</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.moreCircleButton}
          onPress={handleTopMoreMenu}
          activeOpacity={0.75}
          accessibilityLabel="More options"
        >
          <Text style={styles.moreCircleDots}>•••</Text>
        </TouchableOpacity>
      </View>

      {/* Large Apple iOS 18 "Passwords" Heading */}
      <View style={styles.headerTitleContainer}>
        <Text style={styles.largeHeaderTitle}>Passwords</Text>
      </View>

      {/* If user is actively typing in the bottom search bar, show live filtered results; otherwise show the 2-column Category Grid */}
      {search.trim().length > 0 ? (
        <FlatList
          key="search-results-list"
          data={searchResults}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.searchListContent}
          renderItem={({ item }) => {
            const hasTotp = isTotpItem(item);
            const secReasons = securityFindingsMap.get(item.id);
            return (
              <TouchableOpacity
                style={styles.searchItemCard}
                activeOpacity={0.75}
                onPress={() => {
                  if (hasTotp) {
                    onGoToTotp(item);
                  } else {
                    Alert.alert(item.title, `Username: ${item.username || 'None'}`);
                  }
                }}
              >
                <View style={styles.searchItemAvatar}>
                  <Text style={styles.searchItemAvatarText}>
                    {item.title.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.searchItemDetails}>
                  <Text style={styles.searchItemTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.searchItemUser} numberOfLines={1}>
                    {item.username || 'No username'}
                  </Text>
                  {secReasons && (
                    <Text style={styles.searchItemWarning}>⚠ {secReasons[0]}</Text>
                  )}
                </View>
                {hasTotp && (
                  <View style={styles.totpBadge}>
                    <Text style={styles.totpBadgeText}>2FA</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptySearchContainer}>
              <Text style={styles.emptySearchText}>
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
          keyExtractor={(tile) => tile.id}
          columnWrapperStyle={styles.gridColumnWrapper}
          contentContainerStyle={styles.gridContentContainer}
          renderItem={({ item: tile }) => (
            <TouchableOpacity
              style={[
                styles.categoryTile,
                tile.disabled && styles.categoryTileDisabled,
              ]}
              activeOpacity={tile.disabled ? 0.9 : 0.72}
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
                    tile.disabled && styles.tileCountDisabled,
                  ]}
                >
                  {tile.disabled ? '—' : tile.count}
                </Text>
              </View>

              <View style={styles.tileBottomRow}>
                <Text
                  style={[
                    styles.tileLabelText,
                    tile.disabled && styles.tileLabelDisabled,
                  ]}
                  numberOfLines={1}
                >
                  {tile.label}
                </Text>
                {tile.subtitleBadge && (
                  <Text style={styles.tileComingSoon}>{tile.subtitleBadge}</Text>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Persistent Floating Bottom Bar (iOS 18 Passwords Layout: Folder Button + Search Pill + Circular '+' Button) */}
      <View style={styles.bottomBarContainer}>
        <TouchableOpacity
          style={styles.bottomCircleButton}
          activeOpacity={0.75}
          onPress={() => setActiveCategory('all')}
          accessibilityLabel="Browse all folders and items"
        >
          <Text style={styles.bottomFolderIcon}>📁</Text>
        </TouchableOpacity>

        <View style={styles.bottomSearchPill}>
          <Text style={styles.bottomSearchIcon}>🔍</Text>
          <TextInput
            style={styles.bottomSearchInput}
            placeholder="Search"
            placeholderTextColor={colors.textDim}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={styles.bottomClearText}>✕</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.bottomMicIcon}>🎙</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.bottomAddCircleButton}
          activeOpacity={0.75}
          onPress={() => setShowAddModal(true)}
          accessibilityLabel="Add new password"
        >
          <Text style={styles.bottomAddPlusText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Dark-Mode Add Credential Modal Sheet */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>New Password</Text>
              <TouchableOpacity onPress={handleSaveNewItem}>
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalForm}>
              <Text style={styles.modalFieldLabel}>Website or Label</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. GitHub, Apple, Proton"
                placeholderTextColor={colors.textDim}
                value={newTitle}
                onChangeText={setNewTitle}
              />

              <Text style={styles.modalFieldLabel}>Username or Email</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="name@example.com"
                placeholderTextColor={colors.textDim}
                value={newUsername}
                onChangeText={setNewUsername}
                autoCapitalize="none"
              />

              <Text style={styles.modalFieldLabel}>Password</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter strong password..."
                placeholderTextColor={colors.textDim}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
              />

              <Text style={styles.modalFieldLabel}>2FA / TOTP Secret (Optional)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Base32 secret or otpauth:// URI"
                placeholderTextColor={colors.textDim}
                value={newTotpSecret}
                onChangeText={setNewTotpSecret}
                autoCapitalize="none"
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export { VaultListScreen };

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background, // #09090b (Zinc-950)
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
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  utilityPillText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  moreCircleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreCircleDots: {
    color: colors.text,
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
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  gridContentContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 110,
  },
  gridColumnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  categoryTile: {
    width: '48.2%',
    backgroundColor: colors.surface, // #18181b (Zinc-900)
    borderRadius: radii.xl,          // 18px rounded iOS 18 squircle
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 102,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileIconText: {
    fontSize: 17,
    fontWeight: '800',
  },
  tileCountText: {
    color: colors.textMuted, // Slightly muted top-right count ("30", "11", "3", "6", "0")
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  tileCountDisabled: {
    color: colors.textDim,
    fontSize: 18,
  },
  tileBottomRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tileLabelText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  tileLabelDisabled: {
    color: colors.textMuted,
  },
  tileComingSoon: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  /* Search Results when typing in bottom search bar */
  searchListContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 110,
  },
  searchItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  searchItemAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.iosBlueGlow,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  searchItemAvatarText: {
    color: colors.iosBlue,
    fontSize: 16,
    fontWeight: '700',
  },
  searchItemDetails: {
    flex: 1,
  },
  searchItemTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  searchItemUser: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  searchItemWarning: {
    color: colors.iosRed,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
  totpBadge: {
    backgroundColor: colors.iosYellowGlow,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  totpBadgeText: {
    color: colors.iosYellow,
    fontSize: 10,
    fontWeight: '700',
  },
  emptySearchContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptySearchText: {
    color: colors.textDim,
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
    backgroundColor: 'rgba(9, 9, 11, 0.92)',
    gap: 10,
  },
  bottomCircleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomFolderIcon: {
    fontSize: 17,
  },
  bottomSearchPill: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  bottomSearchIcon: {
    fontSize: 14,
    marginRight: 8,
    opacity: 0.75,
  },
  bottomSearchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: 0,
  },
  bottomMicIcon: {
    fontSize: 14,
    opacity: 0.7,
    marginLeft: 6,
  },
  bottomClearText: {
    color: colors.textMuted,
    fontSize: 15,
    paddingLeft: 8,
  },
  bottomAddCircleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomAddPlusText: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '400',
    lineHeight: 28,
  },
  /* Modal Sheet */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalCancelText: {
    color: colors.textMuted,
    fontSize: 16,
  },
  modalHeaderTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  modalSaveText: {
    color: colors.iosBlue,
    fontSize: 16,
    fontWeight: '700',
  },
  modalForm: {
    marginTop: spacing.md,
  },
  modalFieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  modalInput: {
    backgroundColor: colors.background,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    color: colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
