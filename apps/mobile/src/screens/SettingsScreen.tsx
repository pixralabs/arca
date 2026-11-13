/**
 * @file apps/mobile/src/screens/SettingsScreen.tsx
 * @description Arca Mobile — Frictionless QR Code Device Pairing ("Link a Device"),
 * Opt-In Cloud Sync Toggle, SAS Verification, Active Device Revocation, and Danger Zone Delete.
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
  createDevicePairingQrPayload,
  signAndApproveScannedPairingQr,
  QrSyncChallengePayload,
} from '../crypto/mobileCrypto';
import { clearBiometricSlotKey } from '../crypto/keychain';
import { QrScannerModal } from '../components/QrScannerModal';

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

  const handleToggleSync = (enabled: boolean) => {
    triggerLightHaptic();
    setSyncEnabled(enabled);
    setSyncStatus(
      enabled
        ? 'Opt-In Cloud Sync Active · Encrypted Blobs Synced via PostgreSQL Relay'
        : '100% Local Mode (SQLite Only · Zero Network)'
    );
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
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <AnimatedScreen style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
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

          {/* ── Cloud Sync Section ── */}
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
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Text style={[styles.cardStatus, { color: colors.primary }]}>
                {syncStatus}
              </Text>
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
    </SafeAreaView>
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
