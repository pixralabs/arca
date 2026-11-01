/**
 * @file apps/mobile/src/screens/VaultScreen.tsx
 * @description Arca Mobile — Decrypted Vault Item List with Search and Quick Actions.
 */

import React, { useState, useEffect, useMemo } from 'react';
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
import { mobileGetDecryptedItems, mobileSaveItem, clearActiveSession } from '../crypto/mobileCrypto';
import { VaultItemPlaintext } from '@vaultguard/shared';

interface VaultScreenProps {
  onLock: () => void;
  onGoToGenerator: () => void;
  onGoToTotp: (item: VaultItemPlaintext) => void;
  onGoToSettings: () => void;
}

export function VaultScreen({
  onLock,
  onGoToGenerator,
  onGoToTotp,
  onGoToSettings,
}: VaultScreenProps) {
  const [items, setItems] = useState<VaultItemPlaintext[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadItems = async () => {
    setLoading(true);
    try {
      const list = await mobileGetDecryptedItems();
      setItems(list);
    } catch (err: any) {
      Alert.alert('Error', 'Failed to read vault items.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.username && item.username.toLowerCase().includes(q))
    );
  }, [items, search]);

  const handleAddNew = async () => {
    Alert.prompt(
      'New Item Title',
      'Enter service or site name:',
      async (title) => {
        if (!title || !title.trim()) return;
        try {
          const newItem: VaultItemPlaintext = {
            id: 'item_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
            title: title.trim(),
            username: '',
            password: '',
            urls: [],
            updatedAt: Date.now(),
          };
          await mobileSaveItem(newItem);
          await loadItems();
        } catch {
          Alert.alert('Error', 'Failed to create item.');
        }
      }
    );
  };

  const handleLockVault = () => {
    clearActiveSession();
    onLock();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Arca Vault</Text>
          <Text style={styles.itemCount}>
            {items.length} {items.length === 1 ? 'credential' : 'credentials'} stored
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton} onPress={onGoToGenerator}>
            <Text style={styles.iconButtonText}>⚡</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={onGoToSettings}>
            <Text style={styles.iconButtonText}>⚙</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.lockButton} onPress={handleLockVault}>
            <Text style={styles.lockButtonText}>Lock</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search items..."
          placeholderTextColor={colors.textDim}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.itemCard}
            onPress={() => {
              if (item.totpConfig) {
                onGoToTotp(item);
              } else {
                Alert.alert(item.title, `Username: ${item.username || 'None'}`);
              }
            }}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
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
            </View>
            {item.totpConfig && (
              <View style={styles.totpBadge}>
                <Text style={styles.totpBadgeText}>2FA</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {loading ? 'Decrypting items...' : 'No credentials found'}
            </Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={handleAddNew}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
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
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  itemCount: {
    color: colors.textDim,
    fontSize: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconButton: {
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
  },
  iconButtonText: {
    fontSize: 16,
    color: colors.text,
  },
  lockButton: {
    backgroundColor: colors.roseSubtle,
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.3)',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  lockButtonText: {
    color: colors.rose,
    fontSize: 12,
    fontWeight: '600',
  },
  searchContainer: {
    padding: spacing.md,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 80,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.emeraldSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    color: colors.emerald,
    fontSize: 16,
    fontWeight: '700',
  },
  itemDetails: {
    flex: 1,
  },
  itemTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  itemUser: {
    color: colors.textMuted,
    fontSize: 13,
  },
  totpBadge: {
    backgroundColor: colors.amberSubtle,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  totpBadgeText: {
    color: colors.amber,
    fontSize: 10,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 14,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.emerald,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  fabText: {
    color: colors.background,
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
});
