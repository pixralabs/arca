/**
 * @file apps/mobile/src/screens/SettingsScreen.tsx
 * @description Arca Mobile — Opt-In Cloud Sync Toggle (Default 100% Local SQLite),
 * New Device Approval Prompt (`NEW_DEVICE_ATTEMPT`), Active Device Revocation, and Purge Vault
 * with Strict Monochrome (Pure Black & White) & Soft Red (`#ef4444`) Danger Palette, 24px Curvy Cards,
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
  TextInput,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from '../components/SafeAreaView';
import { Smartphone, Sun, Moon, AlertTriangle, X } from 'lucide-react-native';
import {
  useTheme,
  ThemePreference,
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

const THEME_OPTIONS: {
  key: ThemePreference;
  label: string;
  icon: (color: string) => React.ReactNode;
}[] = [
  {
    key: 'system',
    label: 'System',
    icon: (color: string) => <Smartphone size={15} color={color} style={{ marginRight: 6 }} />,
  },
  {
    key: 'light',
    label: 'Light',
    icon: (color: string) => <Sun size={15} color={color} style={{ marginRight: 6 }} />,
  },
  {
    key: 'dark',
    label: 'Dark',
    icon: (color: string) => <Moon size={15} color={color} style={{ marginRight: 6 }} />,
  },
];

export function SettingsScreen({ onBack, onPurged }: SettingsScreenProps) {
  const { colors, isDark, themePreference, setThemePreference } = useTheme();

  const segmentedBg = isDark ? '#18181B' : '#F4F4F5';
  const activePillBg = isDark ? '#FFFFFF' : '#000000';
  const activeTextColor = isDark ? '#000000' : '#FFFFFF';
  const inactiveTextColor = isDark ? '#A1A1AA' : '#52525B';

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

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    if (deleteConfirmText.trim() !== 'DELETE') return;
    triggerLightHaptic();
    setIsDeleting(true);
    try {
      clearActiveSession();
      await clearBiometricSlotKey();
      await purgeAllVaultData();
      try {
        await fetch('https://relay.arca.app/v1/account', { method: 'DELETE' });
      } catch {
        // Offline or relay unavailable — local purge already complete
      }
      setIsDeleting(false);
      setShowDeleteModal(false);
      triggerSuccessHaptic();
      Alert.alert('Vault Deleted', 'All data has been wiped from this device.');
      onPurged();
    } catch (err: any) {
      setIsDeleting(false);
      Alert.alert('Error', err?.message || 'Failed to delete vault.');
    }
  };

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
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

        {/* ── Appearance Section ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            Appearance
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
            Choose how Arca looks to you.
          </Text>

          <View
            style={[
              styles.segmentedContainer,
              {
                backgroundColor: segmentedBg,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
              },
            ]}
          >
            {THEME_OPTIONS.map((opt) => {
              const isActive = themePreference === opt.key;
              const textColor = isActive ? activeTextColor : inactiveTextColor;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.segmentedItem,
                    isActive && {
                      backgroundColor: activePillBg,
                      shadowColor: isDark ? '#ffffff' : '#000000',
                      shadowOpacity: isDark ? 0.16 : 0.12,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: 3,
                    },
                  ]}
                  onPress={() => {
                    if (themePreference !== opt.key) {
                      triggerLightHaptic();
                      setThemePreference(opt.key);
                    }
                  }}
                  activeOpacity={0.8}
                  hitSlop={HIT_SLOP}
                >
                  {opt.icon(textColor)}
                  <Text style={[styles.segmentedText, { color: textColor }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
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
          <Text style={[styles.sectionTitle, { color: colors.danger }]}>
            Danger Zone
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
            Irreversible actions that permanently delete local SQLite data and hardware keys.
          </Text>
          <TouchableOpacity
            style={[
              styles.dangerButton,
              {
                backgroundColor: colors.dangerGlow,
                borderColor: colors.dangerBorder,
              },
            ]}
            onPress={() => {
              triggerLightHaptic();
              setDeleteConfirmText('');
              setShowDeleteModal(true);
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.dangerButtonText, { color: colors.danger }]}>
              Delete Vault & Account
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Danger Zone Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowDeleteModal(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.modalSheet,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.modalHeader}>
                  <View style={styles.modalIconRow}>
                    <View
                      style={[
                        styles.warningIconBg,
                        { backgroundColor: colors.dangerGlow },
                      ]}
                    >
                      <AlertTriangle size={22} color={colors.danger} />
                    </View>
                    <Text style={[styles.modalTitle, { color: colors.textHeading }]}>
                      Delete Vault & Account
                    </Text>
                  </View>
                  <TouchableOpacity
                    hitSlop={HIT_SLOP}
                    onPress={() => setShowDeleteModal(false)}
                  >
                    <X size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.modalDesc, { color: colors.textMuted }]}>
                  This action is permanent and cannot be undone. All encrypted credentials, hardware biometric keys, and local SQLite data will be wiped from this device.
                </Text>

                <Text style={[styles.confirmPrompt, { color: colors.text }]}>
                  Type <Text style={{ fontWeight: '800', color: colors.danger }}>DELETE</Text> to confirm:
                </Text>

                <TextInput
                  style={[
                    styles.confirmInput,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor:
                        deleteConfirmText.trim() === 'DELETE'
                          ? colors.danger
                          : colors.border,
                      color: colors.text,
                    },
                  ]}
                  placeholder="Type DELETE"
                  placeholderTextColor={colors.textDim}
                  value={deleteConfirmText}
                  onChangeText={setDeleteConfirmText}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />

                <TouchableOpacity
                  style={[
                    styles.modalDeleteButton,
                    {
                      backgroundColor:
                        deleteConfirmText.trim() === 'DELETE'
                          ? colors.danger
                          : isDark
                          ? '#27272a'
                          : '#e4e4e7',
                      opacity: deleteConfirmText.trim() === 'DELETE' ? 1 : 0.45,
                    },
                  ]}
                  disabled={deleteConfirmText.trim() !== 'DELETE' || isDeleting}
                  onPress={handleConfirmDelete}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.modalDeleteButtonText,
                      {
                        color:
                          deleteConfirmText.trim() === 'DELETE'
                            ? '#ffffff'
                            : colors.textDim,
                      },
                    ]}
                  >
                    {isDeleting ? 'Deleting...' : 'Permanently Delete Vault'}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    fontFamily: 'Inter',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  segmentedContainer: {
    flexDirection: 'row',
    borderRadius: radii.pill,
    padding: 4,
    borderWidth: 1,
  },
  segmentedItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    minHeight: 44,
    borderRadius: radii.pill,
  },
  segmentedText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
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

  // Danger Zone Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalSheet: {
    width: '100%',
    maxWidth: 400,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing.xl,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  warningIconBg: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  modalDesc: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  confirmPrompt: {
    fontFamily: 'Inter',
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  confirmInput: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    borderWidth: 1.5,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  modalDeleteButton: {
    borderRadius: radii.pill,
    minHeight: layout.minButtonHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDeleteButtonText: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});