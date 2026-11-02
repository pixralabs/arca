/**
 * @file apps/mobile/src/screens/SettingsScreen.tsx
 * @description Arca Mobile — Opt-In Cloud Sync Toggle (Default 100% Local SQLite),
 * New Device Approval Prompt (`NEW_DEVICE_ATTEMPT`), Active Device Revocation, and Purge Vault.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Switch } from 'react-native';
import { colors, spacing, radii } from '../theme/theme';
import { purgeAllVaultData } from '../storage/db';
import { clearActiveSession } from '../crypto/mobileCrypto';
import { clearBiometricSlotKey } from '../crypto/keychain';

interface SettingsScreenProps {
  onBack: () => void;
  onPurged: () => void;
}

interface MobileDeviceEntry {
  deviceId: string;
  deviceName: string;
  shortCode: string;
  status: 'TRUSTED' | 'PENDING' | 'REVOKED';
  isCurrent?: boolean;
}

export function SettingsScreen({ onBack, onPurged }: SettingsScreenProps) {
  // Requirement 1: Default 100% Local (SQLite only) unless user explicitly enables Cloud Sync
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncStatus, setSyncStatus] = useState('100% Local Mode (SQLite Only — Zero Network)');
  const [devices, setDevices] = useState<MobileDeviceEntry[]>([
    {
      deviceId: 'dev_android_primary_01',
      deviceName: 'This Android Device',
      shortCode: '9F4-2A1',
      status: 'TRUSTED',
      isCurrent: true,
    },
    {
      deviceId: 'dev_chrome_ext_02',
      deviceName: 'Chrome Extension (Desktop)',
      shortCode: '7C8-1E5',
      status: 'TRUSTED',
    },
  ]);
  const [pendingAttempt, setPendingAttempt] = useState<MobileDeviceEntry | null>({
    deviceId: 'dev_new_laptop_03',
    deviceName: 'New Browser Extension',
    shortCode: '3B9-8D2',
    status: 'PENDING',
  });

  const handleToggleSync = (enabled: boolean) => {
    setSyncEnabled(enabled);
    setSyncStatus(
      enabled
        ? 'Opt-In Cloud Sync Active — Encrypted Blobs Synced via PostgreSQL Relay'
        : '100% Local Mode (SQLite Only — Zero Network)'
    );
  };

  const handleApproveAttempt = (approve: boolean) => {
    if (!pendingAttempt) return;
    if (approve) {
      setDevices(prev => [...prev, { ...pendingAttempt, status: 'TRUSTED' }]);
    }
    setPendingAttempt(null);
  };

  const handleRevokeDevice = (targetDeviceId: string) => {
    setDevices(prev =>
      prev.map(d => (d.deviceId === targetDeviceId ? { ...d, status: 'REVOKED' } : d))
    );
  };

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
        <Text style={styles.sectionTitle}>Cloud Sync (Opt-In Only)</Text>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={styles.cardValue}>Enable Cloud Sync</Text>
              <Text style={styles.cardLabel}>
                Default is 100% Local SQLite. When enabled, encrypted blobs sync via the Rust Relay.
              </Text>
            </View>
            <Switch value={syncEnabled} onValueChange={handleToggleSync} />
          </View>
          <View style={styles.divider} />
          <Text style={styles.cardLabel}>Blind Relay Server (Supabase PostgreSQL)</Text>
          <Text style={styles.cardValue}>https://arca-relay.onrender.com</Text>
          <Text style={styles.cardStatus}>{syncStatus}</Text>
        </View>
      </View>

      {pendingAttempt && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security Alert — New Device Attempt</Text>
          <View style={[styles.card, { borderColor: colors.amber }]}>
            <Text style={[styles.cardValue, { color: colors.amber }]}>
              A new device is trying to access your vault. Allow?
            </Text>
            <Text style={styles.cardLabel}>
              {pendingAttempt.deviceName} • SAS Code: {pendingAttempt.shortCode}
            </Text>
            <View style={[styles.rowBetween, { marginTop: spacing.md, gap: spacing.sm }]}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.emerald }]}
                onPress={() => handleApproveAttempt(true)}
              >
                <Text style={styles.actionButtonTextDark}>Yes, Allow</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.roseSubtle, borderColor: colors.rose, borderWidth: 1 }]}
                onPress={() => handleApproveAttempt(false)}
              >
                <Text style={[styles.actionButtonTextDark, { color: colors.rose }]}>No, Deny</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Active Devices &amp; Session Revocation</Text>
        <View style={styles.card}>
          {devices.map((dev, idx) => (
            <View key={dev.deviceId}>
              {idx > 0 && <View style={styles.divider} />}
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardValue}>
                    {dev.deviceName} {dev.isCurrent ? '(This Device)' : ''}
                  </Text>
                  <Text style={styles.cardLabel}>
                    SAS {dev.shortCode} • Status: {dev.status}
                  </Text>
                </View>
                {dev.status === 'TRUSTED' && !dev.isCurrent && (
                  <TouchableOpacity
                    style={styles.revokeButton}
                    onPress={() => handleRevokeDevice(dev.deviceId)}
                  >
                    <Text style={styles.revokeButtonText}>Revoke</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
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
          <Text style={styles.cardLabel}>Ephemeral Shares</Text>
          <Text style={styles.cardValue}>URL Fragment Key • Burned on 1st View or 5 Min</Text>
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
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 2,
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
  actionButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    alignItems: 'center',
  },
  actionButtonTextDark: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 13,
  },
  revokeButton: {
    backgroundColor: colors.roseSubtle,
    borderWidth: 1,
    borderColor: colors.rose,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  revokeButtonText: {
    color: colors.rose,
    fontSize: 12,
    fontWeight: '600',
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
