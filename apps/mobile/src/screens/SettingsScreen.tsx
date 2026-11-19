/**
 * @file apps/mobile/src/screens/SettingsScreen.tsx
 * @description Arca Mobile — Frictionless QR Code Device Pairing ("Link a Device"),
 * Opt-In Cloud Sync Toggle, SAS Verification, Active Device Revocation, and Danger Zone Delete.
 */

import React, { useState, useEffect } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import {
  Smartphone,
  Sun,
  Moon,
  AlertTriangle,
  X,
  QrCode,
  ScanLine,
  CheckCircle2,
  ShieldCheck,
  KeyRound,
  Sparkles,
  Cloud,
  CloudUpload,
  RefreshCw,
  Server,
} from 'lucide-react-native';
import {
  useTheme,
  ThemePreference,
  spacing,
  radii,
  layout,
  HIT_SLOP,
  getSafeTopPadding,
  AnimatedScreen,
  triggerLightHaptic,
  triggerSuccessHaptic,
  triggerErrorHaptic,
} from '../theme/theme';
import { purgeAllVaultData } from '../storage/db';
import {
  clearActiveSession,
  getActiveSession,
  createDevicePairingQrPayload,
  signAndApproveScannedPairingQr,
  QrSyncChallengePayload,
} from '../crypto/mobileCrypto';
import { clearBiometricSlotKey } from '../crypto/keychain';
import { QrScannerModal } from '../components/QrScannerModal';
import { cloudBackupService, CloudStatusInfo } from '../services/CloudBackupService';

interface SettingsScreenProps {
  onBack: () => void;
  onPurged: () => void;
  onOpenRecoveryKit?: () => void;
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
    icon: (color: string) => (
      <Smartphone size={15} color={color} style={{ marginRight: 6 }} />
    ),
  },
  {
    key: 'light',
    label: 'Light',
    icon: (color: string) => (
      <Sun size={15} color={color} style={{ marginRight: 6 }} />
    ),
  },
  {
    key: 'dark',
    label: 'Dark',
    icon: (color: string) => (
      <Moon size={15} color={color} style={{ marginRight: 6 }} />
    ),
  },
];

export function SettingsScreen({
  onBack,
  onPurged,
  onOpenRecoveryKit,
}: SettingsScreenProps) {
  const { colors, isDark, themePreference, setThemePreference } = useTheme();
  const insets = useSafeAreaInsets();

  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncStatus, setSyncStatus] = useState(
    '100% Local Mode (SQLite Only · Zero Network)'
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

  // Frictionless QR Device Pairing State
  const [showLinkDeviceModal, setShowLinkDeviceModal] = useState(false);
  const [qrChallengePayload, setQrChallengePayload] =
    useState<QrSyncChallengePayload | null>(null);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [pairedSuccessDevice, setPairedSuccessDevice] =
    useState<QrSyncChallengePayload | null>(null);

  // Native Android Autofill Service State
  const [autofillEnabled, setAutofillEnabled] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const checkAutofill = async () => {
      try {
        const { NativeModules, Platform } = require('react-native');
        if (Platform.OS === 'android' && NativeModules.ArcaAutofillModule) {
          const enabled = await NativeModules.ArcaAutofillModule.isAutofillEnabled();
          if (isMounted) setAutofillEnabled(Boolean(enabled));
        }
      } catch {}
    };
    checkAutofill();
    const interval = setInterval(checkAutofill, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleOpenAutofillSettings = async () => {
    triggerLightHaptic();
    try {
      const { NativeModules, Platform } = require('react-native');
      if (Platform.OS === 'android' && NativeModules.ArcaAutofillModule) {
        await NativeModules.ArcaAutofillModule.openAutofillSettings();
      }
    } catch (e) {
      console.warn('Failed to open autofill settings:', e);
    }
  };

  const successBadgeScale = useSharedValue(0.5);
  const animatedSuccessStyle = useAnimatedStyle(() => ({
    transform: [{ scale: successBadgeScale.value }],
  }));

  const handleOpenLinkDevice = async () => {
    triggerLightHaptic();
    setPairedSuccessDevice(null);
    const challenge = await createDevicePairingQrPayload(
      'Arca Android Device',
      'https://arca-rc8v.onrender.com'
    );
    setQrChallengePayload(challenge);
    setShowLinkDeviceModal(true);
  };

  const handleDeviceQrScanned = async (rawQr: string) => {
    setShowQrScanner(false);
    try {
      const result = await signAndApproveScannedPairingQr(
        rawQr,
        'dev_android_primary_01'
      );
      setSyncEnabled(true);
      setSyncStatus(
        'Opt-In Cloud Sync Active · Ed25519 QR Paired via Rust Relay'
      );
      setDevices((prev) => [
        ...prev.filter((d) => d.deviceId !== result.payload.deviceId),
        {
          deviceId: result.payload.deviceId,
          deviceName: result.payload.deviceName,
          shortCode: result.payload.shortCode,
          status: 'TRUSTED',
        },
      ]);
      setPairedSuccessDevice(result.payload);
      setShowLinkDeviceModal(true);
      successBadgeScale.value = withSequence(
        withSpring(1.12, { damping: 12, stiffness: 240 }),
        withSpring(1, { damping: 16, stiffness: 220 })
      );
      triggerSuccessHaptic();
    } catch (err: any) {
      triggerErrorHaptic();
      Alert.alert(
        'Pairing Failed',
        err?.message || 'Could not verify device sync QR code.'
      );
    }
  };

  // Automated Cloud Backup State (Render + Supabase)
  const [cloudInfo, setCloudInfo] = useState<CloudStatusInfo>({
    enabled: false,
    status: 'disabled',
    lastSyncTime: null,
    accountId: null,
  });
  const [isCloudLoading, setIsCloudLoading] = useState(false);

  useEffect(() => {
    const unsub = cloudBackupService.subscribe((info) => {
      setCloudInfo(info);
      setSyncEnabled(info.enabled);
      setSyncStatus(
        info.enabled
          ? `Automated Zero-Knowledge Cloud Backup Active · PostgreSQL Relay (Render)`
          : `100% Local Mode (SQLite Only · Zero Network)`
      );
    });
    return unsub;
  }, []);

  const handleActivateCloudBackup = async () => {
    triggerLightHaptic();
    const session = getActiveSession();
    if (!session) {
      Alert.alert('Session Locked', 'Please unlock your vault before activating backup.');
      return;
    }
    setIsCloudLoading(true);
    try {
      const headerStr = JSON.stringify(session.header);
      const res = await cloudBackupService.enableCloudBackup(session.dek, headerStr);
      if (res.success) {
        triggerSuccessHaptic();
        Alert.alert(
          'Cloud Backup Active',
          `Your vault is now backed up securely to the cloud (${res.itemsSynced} items synced).\n\nIf you ever delete the app or switch devices, your passwords will restore automatically.`
        );
      } else {
        triggerErrorHaptic();
        Alert.alert('Backup Error', res.error || 'Failed to activate cloud backup');
      }
    } catch (e: any) {
      triggerErrorHaptic();
      Alert.alert('Backup Error', e?.message || 'Failed to activate cloud backup');
    } finally {
      setIsCloudLoading(false);
    }
  };

  const handleBackupNow = async () => {
    triggerLightHaptic();
    const session = getActiveSession();
    if (!session) {
      Alert.alert('Session Locked', 'Please unlock your vault before running sync.');
      return;
    }
    setIsCloudLoading(true);
    try {
      const count = await cloudBackupService.pushAllLocalItems(session.dek);
      triggerSuccessHaptic();
      Alert.alert('Vault Synced', `Successfully backed up ${count} items to the secure cloud.`);
    } catch (e: any) {
      triggerErrorHaptic();
      Alert.alert('Sync Error', e?.message || 'Could not sync vault to cloud');
    } finally {
      setIsCloudLoading(false);
    }
  };

  const handleToggleSync = (enabled: boolean) => {
    triggerLightHaptic();
    if (enabled) {
      handleActivateCloudBackup();
    } else {
      setSyncEnabled(false);
      setSyncStatus('100% Local Mode (SQLite Only · Zero Network)');
    }
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
        await fetch('https://arca-rc8v.onrender.com/v1/account', {
          method: 'DELETE',
        });
      } catch {
        // Offline or relay unavailable
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
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
        },
      ]}
    >
      <AnimatedScreen style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.header,
              {
                borderBottomColor: colors.border,
                paddingTop: getSafeTopPadding(10),
              },
            ]}
          >
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
                ← Back
              </Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textHeading }]}>
              Settings
            </Text>
            <View style={{ width: layout.minTouchTarget }} />
          </View>

          {/* ── 1-Tap Native Autofill Section ── */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
              System Autofill Service
            </Text>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: autofillEnabled ? colors.border : colors.primaryBorderGlow,
                  borderWidth: 1,
                },
              ]}
            >
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, paddingRight: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <KeyRound size={17} color={colors.primary} style={{ marginRight: 6 }} />
                    <Text style={[styles.cardValue, { color: colors.textHeading, marginBottom: 0 }]}>
                      1-Tap Login & Autofill
                    </Text>
                  </View>
                  <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
                    Autofill passwords, logins, and generate strong passwords seamlessly across Chrome, Google, and all Android apps.
                  </Text>
                </View>

                <View
                  style={[
                    styles.sasPill,
                    {
                      backgroundColor: autofillEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                      borderColor: autofillEnabled ? 'rgba(16, 185, 129, 0.4)' : 'rgba(99, 102, 241, 0.4)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.sasPillText,
                      { color: autofillEnabled ? '#10B981' : colors.primary },
                    ]}
                  >
                    {autofillEnabled ? 'Active' : 'Setup'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryPillButton,
                  {
                    backgroundColor: autofillEnabled ? colors.surfaceSubtle : colors.primary,
                    borderColor: autofillEnabled ? colors.border : colors.primary,
                    borderWidth: 1,
                    marginTop: spacing.md,
                  },
                ]}
                hitSlop={HIT_SLOP}
                activeOpacity={0.85}
                onPress={handleOpenAutofillSettings}
              >
                <Sparkles size={17} color={autofillEnabled ? colors.text : colors.onPrimary} />
                <Text
                  style={[
                    styles.primaryPillButtonText,
                    { color: autofillEnabled ? colors.text : colors.onPrimary },
                  ]}
                >
                  {autofillEnabled ? 'Manage Autofill Provider' : 'Enable 1-Tap Autofill'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Frictionless QR Device Pairing Section ── */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
              Frictionless Device Pairing (QR Sync)
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
                Link a Desktop or Mobile Device
              </Text>
              <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
                Pair instantaneously like WhatsApp Web. Scan a device QR challenge to sign an Ed25519 approval certificate without typing URLs.
              </Text>

              <View style={styles.qrActionsRow}>
                <TouchableOpacity
                  style={[
                    styles.primaryPillButton,
                    { backgroundColor: colors.primary, flex: 1 },
                  ]}
                  hitSlop={HIT_SLOP}
                  activeOpacity={0.85}
                  onPress={handleOpenLinkDevice}
                >
                  <QrCode size={17} color={colors.onPrimary} />
                  <Text
                    style={[
                      styles.primaryPillButtonText,
                      { color: colors.onPrimary },
                    ]}
                  >
                    Link a Device
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.secondaryPillButton,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      borderColor: colors.border,
                      flex: 1,
                    },
                  ]}
                  hitSlop={HIT_SLOP}
                  activeOpacity={0.85}
                  onPress={() => {
                    triggerLightHaptic();
                    setShowQrScanner(true);
                  }}
                >
                  <ScanLine size={17} color={colors.text} />
                  <Text
                    style={[styles.secondaryPillButtonText, { color: colors.text }]}
                  >
                    Scan Device QR
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ── Next-Gen Recovery Kit Launcher ── */}
          {onOpenRecoveryKit && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                Shamir 2-of-3 Recovery Kit
              </Text>
              <View style={[styles.card, { backgroundColor: colors.surface }]}>
                <Text style={[styles.cardValue, { color: colors.textHeading }]}>
                  Export Printable Recovery Kit (PDF / Photos)
                </Text>
                <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
                  View your 3 threshold shares, export to PDF/Photos, or verify your 24-word backup.
                </Text>
                <TouchableOpacity
                  style={[
                    styles.primaryPillButton,
                    {
                      backgroundColor: colors.primaryGlow,
                      borderColor: colors.primaryBorderGlow,
                      borderWidth: 1,
                      marginTop: spacing.md,
                    },
                  ]}
                  hitSlop={HIT_SLOP}
                  onPress={() => {
                    triggerLightHaptic();
                    onOpenRecoveryKit();
                  }}
                >
                  <ShieldCheck size={17} color={colors.primary} />
                  <Text
                    style={[
                      styles.primaryPillButtonText,
                      { color: colors.primary },
                    ]}
                  >
                    Open Shamir 2-of-3 Recovery Kit
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Appearance Section ── */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
              Appearance
            </Text>
            <View
              style={[
                styles.segmentedContainer,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              {THEME_OPTIONS.map((opt) => {
                const isActive = themePreference === opt.key;
                const textColor = isActive ? colors.onPrimary : colors.textMuted;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.segmentedItem,
                      isActive && { backgroundColor: colors.primary },
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

          {/* ── Zero-Knowledge Cloud Backup Section (Render + Supabase) ── */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
              Automated Zero-Knowledge Cloud Backup
            </Text>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: cloudInfo.enabled ? colors.border : colors.primaryBorderGlow,
                  borderWidth: 1,
                },
              ]}
            >
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, paddingRight: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Cloud size={18} color={colors.primary} style={{ marginRight: 6 }} />
                    <Text style={[styles.cardValue, { color: colors.textHeading, marginBottom: 0 }]}>
                      Automated Cloud Backup
                    </Text>
                  </View>
                  <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
                    Zero-Knowledge backup to Render & Supabase. Even if you uninstall Arca or switch phones, your vault restores instantly with your Master Password or 24-Word Recovery Phrase.
                  </Text>
                </View>

                {/* Cloud Status Indicator Pill */}
                <View
                  style={[
                    styles.sasPill,
                    {
                      backgroundColor:
                        cloudInfo.enabled && cloudInfo.status === 'synced'
                          ? 'rgba(16, 185, 129, 0.15)'
                          : cloudInfo.status === 'syncing'
                          ? 'rgba(245, 158, 11, 0.15)'
                          : cloudInfo.status === 'offline'
                          ? 'rgba(239, 68, 68, 0.15)'
                          : colors.surfaceSubtle,
                      borderColor:
                        cloudInfo.enabled && cloudInfo.status === 'synced'
                          ? 'rgba(16, 185, 129, 0.4)'
                          : cloudInfo.status === 'syncing'
                          ? 'rgba(245, 158, 11, 0.4)'
                          : cloudInfo.status === 'offline'
                          ? 'rgba(239, 68, 68, 0.4)'
                          : colors.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    },
                  ]}
                >
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor:
                        cloudInfo.enabled && cloudInfo.status === 'synced'
                          ? '#10B981'
                          : cloudInfo.status === 'syncing'
                          ? '#F59E0B'
                          : cloudInfo.status === 'offline'
                          ? '#EF4444'
                          : colors.textMuted,
                    }}
                  />
                  <Text
                    style={[
                      styles.sasPillText,
                      {
                        color:
                          cloudInfo.enabled && cloudInfo.status === 'synced'
                            ? '#10B981'
                            : cloudInfo.status === 'syncing'
                            ? '#F59E0B'
                            : cloudInfo.status === 'offline'
                            ? '#EF4444'
                            : colors.textMuted,
                        fontSize: 11,
                      },
                    ]}
                  >
                    {cloudInfo.enabled && cloudInfo.status === 'synced'
                      ? 'Synced'
                      : cloudInfo.status === 'syncing'
                      ? 'Syncing...'
                      : cloudInfo.status === 'offline'
                      ? 'Offline'
                      : 'Disabled'}
                  </Text>
                </View>
              </View>

              {/* Status details & metrics */}
              {cloudInfo.enabled && (
                <View
                  style={{
                    backgroundColor: colors.surfaceSubtle,
                    borderRadius: radii.md,
                    padding: spacing.sm,
                    marginTop: spacing.md,
                    gap: 4,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 11, color: colors.textDim }}>Cloud Relay</Text>
                    <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: 'monospace' }}>
                      arca-rc8v.onrender.com (Supabase)
                    </Text>
                  </View>
                  {cloudInfo.accountId && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 11, color: colors.textDim }}>Account ID</Text>
                      <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: 'monospace' }}>
                        {cloudInfo.accountId.slice(0, 12)}...
                      </Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 11, color: colors.textDim }}>Last Cloud Sync</Text>
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>
                      {cloudInfo.lastSyncTime
                        ? new Date(cloudInfo.lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'Just now'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Action Buttons */}
              {!cloudInfo.enabled ? (
                <TouchableOpacity
                  style={[
                    styles.primaryPillButton,
                    {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                      marginTop: spacing.md,
                    },
                  ]}
                  hitSlop={HIT_SLOP}
                  activeOpacity={0.85}
                  disabled={isCloudLoading}
                  onPress={handleActivateCloudBackup}
                >
                  {isCloudLoading ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <CloudUpload size={17} color={colors.onPrimary} />
                  )}
                  <Text style={[styles.primaryPillButtonText, { color: colors.onPrimary }]}>
                    {isCloudLoading ? 'Activating Cloud Backup...' : 'Secure Cloud Backup'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                  <TouchableOpacity
                    style={[
                      styles.primaryPillButton,
                      {
                        backgroundColor: colors.surfaceSubtle,
                        borderColor: colors.border,
                        borderWidth: 1,
                        flex: 1,
                      },
                    ]}
                    hitSlop={HIT_SLOP}
                    activeOpacity={0.85}
                    disabled={isCloudLoading}
                    onPress={handleBackupNow}
                  >
                    {isCloudLoading ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <RefreshCw size={15} color={colors.text} />
                    )}
                    <Text style={[styles.primaryPillButtonText, { color: colors.text }]}>
                      {isCloudLoading ? 'Syncing...' : 'Backup Now'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* ── Active Devices List ── */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
              Active Devices & Session Revocation
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
                        SAS {dev.shortCode} · Status: {dev.status}
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

          {/* ── Danger Zone ── */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.danger }]}>
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
              hitSlop={HIT_SLOP}
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

        {/* ── Link a Device (QR Challenge + Smooth Success Animation) Modal ── */}
        <Modal
          visible={showLinkDeviceModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowLinkDeviceModal(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShowLinkDeviceModal(false)}>
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
                    <Text style={[styles.modalTitle, { color: colors.textHeading }]}>
                      {pairedSuccessDevice
                        ? 'Device Paired & Verified!'
                        : 'Link a New Device'}
                    </Text>
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      onPress={() => setShowLinkDeviceModal(false)}
                    >
                      <X size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {pairedSuccessDevice ? (
                    <Animated.View
                      style={[styles.pairedSuccessBox, animatedSuccessStyle]}
                    >
                      <View
                        style={[
                          styles.successIconCircle,
                          { backgroundColor: colors.successGlow },
                        ]}
                      >
                        <CheckCircle2 size={44} color={colors.success} />
                      </View>
                      <Text
                        style={[
                          styles.pairedDeviceName,
                          { color: colors.textHeading },
                        ]}
                      >
                        {pairedSuccessDevice.deviceName}
                      </Text>
                      <Text
                        style={[styles.pairedSasText, { color: colors.primary }]}
                      >
                        Verified SAS Code: {pairedSuccessDevice.shortCode}
                      </Text>
                      <Text
                        style={[styles.modalDesc, { color: colors.textMuted, textAlign: 'center' }]}
                      >
                        Signed with Ed25519 (`VG_DEVICE_APPROVE_V1:`) and added to your trusted sync ring.
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.primaryPillButton,
                          { backgroundColor: colors.primary, width: '100%' },
                        ]}
                        onPress={() => setShowLinkDeviceModal(false)}
                      >
                        <Text
                          style={[
                            styles.primaryPillButtonText,
                            { color: colors.onPrimary },
                          ]}
                        >
                          Done
                        </Text>
                      </TouchableOpacity>
                    </Animated.View>
                  ) : (
                    <>
                      <Text style={[styles.modalDesc, { color: colors.textMuted }]}>
                        Scan this QR code from your other logged-in Arca device, or tap "Scan QR From Other Device" below.
                      </Text>

                      {qrChallengePayload && (
                        <View style={styles.qrDisplayBox}>
                          <View style={styles.qrWhiteFrame}>
                            <QRCode
                              value={JSON.stringify(qrChallengePayload)}
                              size={188}
                              backgroundColor="#ffffff"
                              color="#09090b"
                            />
                          </View>
                          <View
                            style={[
                              styles.sasPill,
                              { backgroundColor: colors.primaryGlow },
                            ]}
                          >
                            <Text
                              style={[styles.sasPillText, { color: colors.primary }]}
                            >
                              SAS Verification Code: {qrChallengePayload.shortCode}
                            </Text>
                          </View>
                        </View>
                      )}

                      <TouchableOpacity
                        style={[
                          styles.primaryPillButton,
                          { backgroundColor: colors.primary, width: '100%' },
                        ]}
                        hitSlop={HIT_SLOP}
                        onPress={() => {
                          setShowLinkDeviceModal(false);
                          setShowQrScanner(true);
                        }}
                      >
                        <ScanLine size={18} color={colors.onPrimary} />
                        <Text
                          style={[
                            styles.primaryPillButtonText,
                            { color: colors.onPrimary },
                          ]}
                        >
                          Scan QR From Other Device
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Camera Scanner for Device B (Old/Trusted) */}
        <QrScannerModal
          visible={showQrScanner}
          title="Scan Device Pairing QR"
          subtitle="Scan the QR code displayed on your new Arca device to sign and approve sync."
          placeholderHint='{"version":"VG_QR_SYNC_V1","accountId":"acc_01","deviceId":"dev_02","deviceName":"Arca Desktop","deviceAuthPubKey":"...","challenge":"...","shortCode":"4A9-1F2","relayUrl":"https://arca-rc8v.onrender.com","timestamp":1731280000000}'
          onClose={() => setShowQrScanner(false)}
          onCodeScanned={handleDeviceQrScanned}
        />

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
                      <Text
                        style={[styles.modalTitle, { color: colors.textHeading }]}
                      >
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
                    This action is permanent. All encrypted credentials, hardware biometric keys, and local SQLite data will be wiped.
                  </Text>

                  <Text style={[styles.confirmPrompt, { color: colors.text }]}>
                    Type{' '}
                    <Text style={{ fontWeight: '800', color: colors.danger }}>
                      DELETE
                    </Text>{' '}
                    to confirm:
                  </Text>

                  <TextInput
                    collapsable={false}
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
      </AnimatedScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    minWidth: layout.minTouchTarget,
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
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
    letterSpacing: -0.3,
    marginBottom: spacing.xs,
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
  },
  card: {
    borderRadius: radii.card,
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
    marginTop: 4,
    lineHeight: 17,
  },
  cardValue: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  cardStatus: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: spacing.md,
  },
  qrActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: layout.minButtonHeight,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
  },
  primaryPillButtonText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: layout.minButtonHeight,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  secondaryPillButtonText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
  },
  revokeButton: {
    borderWidth: 1,
    borderRadius: radii.pill,
    minHeight: layout.minTouchTarget,
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
    borderRadius: radii.pill,
    minHeight: layout.minButtonHeight,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
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
    gap: spacing.sm,
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
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  modalDesc: {
    fontFamily: 'Inter',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.lg,
  },
  qrDisplayBox: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  qrWhiteFrame: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    marginBottom: spacing.md,
  },
  sasPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  sasPillText: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
  },
  pairedSuccessBox: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  successIconCircle: {
    width: 76,
    height: 76,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  pairedDeviceName: {
    fontFamily: 'Inter',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  pairedSasText: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: spacing.md,
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
  },
});
