/**
 * @file apps/mobile/src/screens/SettingsScreen.tsx
 * @description Arca Mobile — Settings, Diagnostics, Relay Server Sync, and Purge Vault.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { colors, spacing, radii } from '../theme/theme';
import { purgeAllVaultData } from '../storage/db';
import { clearActiveSession } from '../crypto/mobileCrypto';
import { clearBiometricSlotKey } from '../crypto/keychain';

interface SettingsScreenProps {
  onBack: () => void;
  onPurged: () => void;
}

export function SettingsScreen({ onBack, onPurged }: SettingsScreenProps) {
  const [syncStatus, setSyncStatus] = useState('Connected to Blind Relay');

  const handlePurgeVault = () => {
    Alert.alert(
      'Purge Entire Vault?',
      'This will delete all encrypted credentials and keys from this device. If you do not have your 24-word recovery phrase, your data is gone forever.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            clearActiveSession();
            await clearBiometricSlotKey();
            purgeAllVaultData();
            Alert.alert('Vault Purged', 'All local data wiped securely.');
            onPurged();
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sync &amp; Relay</Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Blind Relay Server</Text>
          <Text style={styles.cardValue}>https://arca-relay.onrender.com</Text>
          <Text style={styles.cardStatus}>{syncStatus}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security &amp; Encryption</Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>KDF Algorithm</Text>
          <Text style={styles.cardValue}>Argon2id (m=64MB, t=3, p=4)</Text>
          <View style={styles.divider} />
          <Text style={styles.cardLabel}>Envelope Cipher</Text>
          <Text style={styles.cardValue}>XChaCha20-Poly1305 (256-bit)</Text>
          <View style={styles.divider} />
          <Text style={styles.cardLabel}>Hardware Security</Text>
          <Text style={styles.cardValue}>Android Keystore / Secure Enclave</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Danger Zone</Text>
        <TouchableOpacity style={styles.dangerButton} onPress={handlePurgeVault}>
          <Text style={styles.dangerButtonText}>Purge All Local Vault Data</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
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
  backButton: {
    padding: spacing.xs,
  },
  backButtonText: {
    color: colors.emerald,
    fontSize: 16,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  section: {
    padding: spacing.lg,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  cardLabel: {
    color: colors.textDim,
    fontSize: 12,
  },
  cardValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
    marginTop: 2,
  },
  cardStatus: {
    color: colors.emerald,
    fontSize: 12,
    marginTop: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  dangerButton: {
    backgroundColor: colors.roseSubtle,
    borderWidth: 1,
    borderColor: colors.rose,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: colors.rose,
    fontSize: 15,
    fontWeight: '600',
  },
});
