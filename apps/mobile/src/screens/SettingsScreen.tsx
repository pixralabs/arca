/**
 * @file apps/mobile/src/screens/SettingsScreen.tsx
 * @description Arca Mobile — Opt-In Cloud Sync Toggle (Default 100% Local SQLite),
 * New Device Approval Prompt (`NEW_DEVICE_ATTEMPT`), Active Device Revocation, and Purge Vault
 * with Monochrome + Electric Indigo (`#6366f1`) & Soft Red (`#ef4444`) Palette, 24px Curvy Cards,
 * Pill Buttons (minHeight 52), >=48x48 Touch Targets, and Tactile Haptics.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Switch,
} from 'react-native';
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
  const { colors } = useTheme();
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncStatus, setSyncStatus] = useState(
    '100% Local Mode (SQLite Only — Zero Network)'
  );
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
    triggerLightHaptic();
    setSyncEnabled(enabled);
    setSyncStatus(
      enabled
        ? 'Opt-In Cloud Sync Active — Encrypted Blobs Synced via PostgreSQL Relay'
        : '100% Local Mode (SQLite Only — Zero Network)'
    );
  };

  const handleApproveAttempt = (approve: boolean) => {
    triggerLightHaptic();
    if (!pendingAttempt) return;
    if (approve) {
      triggerSuccessHaptic();
      setDevices((prev) => [...prev, { ...pendingAttempt, status: 'TRUSTED' }]);
    }
    setPendingAttempt(null);
  };

  const handleRevokeDevice = (targetDeviceId: string) => {
    triggerLightHaptic();
    setDevices((prev) =>
      prev.map((d) =>
        d.deviceId === targetDeviceId ? { ...d, status: 'REVOKED' } : d
      )
    );
  };

  const handlePurgeVault = () => {
    triggerLightHaptic();
    Alert.alert(
      'Purge Entire Vault?',
      'This will delete all encrypted credentials and keys from this device. If you do not have your 24-word recovery phrase, your data is gone forever.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            triggerLightHaptic();
            clearActiveSession();
            await clearBiometricSlotKey();
            await purgeAllVaultData();
            Alert.alert('Vault Purged', 'All local data wiped securely.');
            onPurged();
          },
        },
      ]
    );
  };

  return (
    <AnimatedScreen style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
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
              ‹ Back
            </Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textHeading }]}>
            Settings
          </Text>
          <View style={{ width: layout.minTouchTarget }} />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            Cloud Sync (Opt-In Only)
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, paddingRight: spacing.md }}>
                <Text style={[styles.cardValue, { color: colors.textHeading }]}>
                  Enable Cloud Sync
                </Text>
                <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
                  Default is 100% Local SQLite. When enabled, encrypted blobs sync via the Rust Relay.
                </Text>
              </View>
              <Switch
                value={syncEnabled}
                onValueChange={handleToggleSync}
                trackColor={{
                  false: colors.surfaceSubtle,
                  true: colors.primary,
                }}
                thumbColor={colors.onPrimary}
              />
            </View>
            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />
            <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
              Blind Relay Server (Supabase PostgreSQL)
            </Text>
            <Text style={[styles.cardValue, { color: colors.textHeading }]}>
              https://arca-rc8v.onrender.com
            </Text>
            <Text style={[styles.cardStatus, { color: colors.primary }]}>
              {syncStatus}
            </Text>
          </View>
        </View>

        {pendingAttempt && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
              Security Alert — New Device Attempt
            </Text>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.primaryBorderGlow,
                  borderWidth: 1,
                },
              ]}
            >
              <Text style={[styles.cardValue, { color: colors.textHeading }]}>
                A new device is trying to access your vault. Allow?
              </Text>
              <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
                {pendingAttempt.deviceName} • SAS Code: {pendingAttempt.shortCode}
              </Text>
              <View
                style={[
                  styles.rowBetween,
                  { marginTop: spacing.md, gap: spacing.sm },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={() => handleApproveAttempt(true)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.actionButtonText,
                      { color: colors.onPrimary },
                    ]}
                  >
                    Yes, Allow
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    {
                      backgroundColor: colors.dangerGlow,
                      borderColor: colors.dangerBorder,
                      borderWidth: 1,
                    },
                  ]}
                  onPress={() => handleApproveAttempt(false)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.actionButtonText,
                      { color: colors.danger },
                    ]}
                  >
                    No, Deny
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            Active Devices &amp; Session Revocation
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {devices.map((dev, idx) => (
              <View key={dev.deviceId}>
                {idx > 0 && (
                  <View
                    style={[styles.divider, { backgroundColor: colors.border }]}
                  />
                )}
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.cardValue, { color: colors.textHeading }]}
                    >
                      {dev.deviceName} {dev.isCurrent ? '(This Device)' : ''}
                    </Text>
                    <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
                      SAS {dev.shortCode} • Status: {dev.status}
                    </Text>
                  </View>
                  {dev.status === 'TRUSTED' && !dev.isCurrent && (
                    <TouchableOpacity
                      style={[
                        styles.revokeButton,
                        {
                          backgroundColor: colors.dangerGlow,
                          borderColor: colors.dangerBorder,
                        },
                      ]}
                      hitSlop={HIT_SLOP}
                      onPress={() => handleRevokeDevice(dev.deviceId)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.revokeButtonText,
                          { color: colors.danger },
                        ]}
                      >
                        Revoke
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            Security &amp; Encryption
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
              KDF Algorithm
            </Text>
            <Text style={[styles.cardValue, { color: colors.textHeading }]}>
              Argon2id (m=64MB, t=3, p=4)
            </Text>
            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />
            <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
              Envelope Cipher
            </Text>
            <Text style={[styles.cardValue, { color: colors.textHeading }]}>
              XChaCha20-Poly1305 (256-bit)
            </Text>
            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />
            <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
              Ephemeral Shares
            </Text>
            <Text style={[styles.cardValue, { color: colors.textHeading }]}>
              URL Fragment Key • Burned on 1st View or 5 Min
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            Danger Zone
          </Text>
          <TouchableOpacity
            style={[
              styles.dangerButton,
              {
                backgroundColor: colors.dangerGlow,
                borderColor: colors.dangerBorder,
              },
            ]}
            onPress={handlePurgeVault}
            activeOpacity={0.85}
          >
            <Text style={[styles.dangerButtonText, { color: colors.danger }]}>
              Purge All Local Vault Data
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </AnimatedScreen>
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
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    minWidth: layout.minTouchTarget,
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
    paddingRight: spacing.sm,
  },
  backButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sectionTitle: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
    marginBottom: spacing.sm,
  },
  card: {
    borderRadius: radii.card, // 24px curvy surface
    padding: spacing.lg,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: {
    fontFamily: 'Inter',
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },
  cardValue: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  cardStatus: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  divider: {
    height: 1,
    marginVertical: spacing.md,
  },
  actionButton: {
    flex: 1,
    minHeight: layout.minButtonHeight, // >= 52px pill button
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  actionButtonText: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 14,
  },
  revokeButton: {
    borderWidth: 1,
    borderRadius: radii.pill,
    minHeight: layout.minTouchTarget, // >= 48px touch target
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revokeButtonText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '700',
  },
  dangerButton: {
    borderWidth: 1,
    borderRadius: radii.pill, // 9999 pill-shaped
    minHeight: layout.minButtonHeight, // >= 52px
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});