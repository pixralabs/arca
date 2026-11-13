/**
 * @file apps/mobile/src/screens/UnlockScreen.tsx
 * @description Ultra-Premium Zero-Knowledge Vault Unlock Screen
 * Strict Monochrome (Black & White) Aesthetic — Native C++ JSI Argon2id (< 200ms),
 * Hardware-Backed Biometric Key Wrapping (StrongBox + CryptoObject / Secure Enclave),
 * OS-Level `FLAG_SECURE` Screenshot Protection, Multi-Vault Switcher, and Shake Error Feedback.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  StatusBar,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from '../components/SafeAreaView';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import {
  Eye,
  EyeOff,
  Fingerprint,
  ChevronDown,
  AlertCircle,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VaultSwitcherModal } from '../components/VaultSwitcherModal';
import {
  useTheme,
  spacing,
  radii,
  layout,
  HIT_SLOP,
  triggerLightHaptic,
  triggerSuccessHaptic,
  triggerHaptic,
} from '../theme/theme';
import {
  mobileUnlockVault,
  mobileUnlockWithBiometrics,
  mobileUnlockWithRecovery,
  clearActiveSession,
} from '../crypto/mobileCrypto';
import {
  hasBiometricSlotKey,
  clearBiometricSlotKey,
} from '../crypto/keychain';
import { setFlagSecure } from '../crypto/securityGuard';
import { getAllVaults, VaultRecord, purgeAllVaultData } from '../storage/db';
import { ArcaBrandLogo } from '../components/ArcaBrandLogo';

declare const __DEV__: boolean;

interface UnlockScreenProps {
  onUnlocked: () => void;
  onGoToSetup: () => void;
}

/* ── Animated Primary Button (Strict Monochrome) ── */
function AnimatedPrimaryButton({
  onPress,
  disabled,
  label,
  primaryColor,
  onPrimaryColor,
  loading = false,
}: {
  onPress: () => void;
  disabled: boolean;
  label: string;
  primaryColor: string;
  onPrimaryColor: string;
  loading?: boolean;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  return (
    <Animated.View style={[animStyle, { marginTop: spacing.lg }]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={0.88}
        style={[
          styles.primaryButton,
          {
            backgroundColor: primaryColor,
            opacity: disabled ? 0.35 : 1,
          },
        ]}
      >
        {loading ? (
          <View style={styles.loadingBtnRow}>
            <ActivityIndicator size="small" color={onPrimaryColor} />
            <Text style={[styles.primaryButtonText, { color: onPrimaryColor }]}>
              Unlocking...
            </Text>
          </View>
        ) : (
          <Text style={[styles.primaryButtonText, { color: onPrimaryColor }]}>
            {label}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

/* ── Main UnlockScreen ── */
export function UnlockScreen({ onUnlocked, onGoToSetup }: UnlockScreenProps) {
  const { colors, isDark } = useTheme();
  const [vaults, setVaults] = useState<VaultRecord[]>([]);
  const [activeVault, setActiveVault] = useState<VaultRecord | null>(null);
  const [showSwitchSheet, setShowSwitchSheet] = useState(false);
  const [isBioEnabledForActive, setIsBioEnabledForActive] = useState(false);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<'password' | 'recovery' | null>(null);

  const passwordRef = useRef<TextInput>(null);

  // Enforce Android FLAG_SECURE on UnlockScreen to block screenshots and screen-recording malware
  useEffect(() => {
    setFlagSecure(true);
  }, []);

  const loadVaults = useCallback(async () => {
    try {
      const allVaults = await getAllVaults();
      setVaults(allVaults);
      if (allVaults.length === 0) {
        onGoToSetup();
        return;
      }
      const savedActiveId = await AsyncStorage.getItem('@arca_active_vault_id').catch(() => null);
      const matched = allVaults.find((v) => v.id === savedActiveId) || allVaults[0];
      setActiveVault(matched);
      if (matched) {
        const hasBio = await hasBiometricSlotKey(matched.id);
        setIsBioEnabledForActive(hasBio);
      }
    } catch {
      // Fallback
    }
  }, [onGoToSetup]);

  useEffect(() => {
    loadVaults();
  }, [loadVaults]);

  const handleSelectVault = async (vault: VaultRecord) => {
    triggerLightHaptic();
    setActiveVault(vault);
    await AsyncStorage.setItem('@arca_active_vault_id', vault.id).catch(() => {});
    const hasBio = await hasBiometricSlotKey(vault.id);
    setIsBioEnabledForActive(hasBio);
    setPassword('');
    setRecoveryPhrase('');
    setErrorMessage(null);
    setShowSwitchSheet(false);
  };

  const shakeOffset = useSharedValue(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const shakeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeOffset.value }],
  }));

  const triggerShakeAnimation = useCallback(() => {
    triggerHaptic('notificationError');
    shakeOffset.value = withSequence(
      withTiming(-12, { duration: 45 }),
      withTiming(12, { duration: 45 }),
      withTiming(-9, { duration: 45 }),
      withTiming(9, { duration: 45 }),
      withTiming(-5, { duration: 45 }),
      withTiming(5, { duration: 45 }),
      withTiming(0, { duration: 45 })
    );
  }, [shakeOffset]);

  /**
   * Native C++ JSI Argon2id Unlock (`m=19456 KiB, t=2, p=1` in < 200ms on physical devices).
   */
  const handleUnlock = async () => {
    if (isLoading) return;
    triggerLightHaptic();
    setErrorMessage(null);

    if (!isRecoveryMode && !password) {
      triggerShakeAnimation();
      setErrorMessage('Please enter your Master Password.');
      return;
    }
    if (isRecoveryMode && !recoveryPhrase) {
      triggerShakeAnimation();
      setErrorMessage('Please enter your 24-word recovery phrase.');
      return;
    }

    Keyboard.dismiss();
    setIsLoading(true);

    try {
      if (isRecoveryMode) {
        await mobileUnlockWithRecovery(recoveryPhrase.trim(), activeVault?.id);
      } else {
        await mobileUnlockVault(password, activeVault?.id);
      }
      triggerSuccessHaptic();
      onUnlocked();
    } catch (err: any) {
      console.error('[UnlockScreen] unlock error:', err?.message || err);
      setIsLoading(false);
      triggerShakeAnimation();
      setErrorMessage('Incorrect Master Password');
      setTimeout(() => setErrorMessage(null), 3000);
    }
  };

  /**
   * Hardware-Backed Biometric Key Unwrapping:
   * Uses StrongBox (`setIsStrongBoxBacked(true)`) + `CryptoObject` on Android and
   * `kSecAccessControlBiometryCurrentSet` (Secure Enclave) on iOS.
   */
  const handleBiometricUnlock = async () => {
    if (isLoading) return;
    triggerLightHaptic();
    setErrorMessage(null);
    const vaultId = activeVault?.id || 'default_vault';
    const vaultName = activeVault?.name || 'Personal Vault';

    try {
      const enrolled = await hasBiometricSlotKey(vaultId);
      if (!enrolled) {
        triggerShakeAnimation();
        setErrorMessage(`Biometric not enrolled for "${vaultName}". Unlock with password first.`);
        return;
      }

      Keyboard.dismiss();
      setIsLoading(true);

      await mobileUnlockWithBiometrics(`Unlock "${vaultName}"`, vaultId);
      triggerSuccessHaptic();
      onUnlocked();
    } catch (err: any) {
      setIsLoading(false);
      triggerShakeAnimation();
      setErrorMessage(err?.message || 'Biometric key invalid or authentication failed.');
    }
  };

  const handleResetVault = () => {
    triggerLightHaptic();
    Alert.alert(
      'Reset Vault?',
      `This will permanently erase all local encrypted data for "${
        activeVault?.name || 'this vault'
      }" from this device. You can restore later via your 24-word recovery phrase.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset & Wipe Local Vault',
          style: 'destructive',
          onPress: async () => {
            triggerLightHaptic();
            clearActiveSession();
            await clearBiometricSlotKey(activeVault?.id);
            await purgeAllVaultData();
            await AsyncStorage.removeItem('@arca_vault_created');
            Alert.alert('Vault Reset', 'All local data wiped securely.');
            onGoToSetup();
          },
        },
      ]
    );
  };

  const inputShellStyle = (field: 'password' | 'recovery') => {
    const focused = focusedField === field;
    return {
      backgroundColor: colors.background,
      borderColor: focused ? colors.primary : colors.border,
    };
  };

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.flex, { backgroundColor: colors.background }]}
    >
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={isDark ? 'light-content' : 'dark-content'}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <ArcaBrandLogo isDark={isDark} size={80} />

          <View
            style={[
              styles.badge,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.badgeText, { color: colors.text }]}>
              {isRecoveryMode ? 'Account Recovery' : 'Zero-Knowledge Vault'}
            </Text>
          </View>

          <Text style={[styles.title, { color: colors.textHeading }]}>
            {isRecoveryMode ? 'Account Recovery' : 'Unlock Vault'}
          </Text>

          {/* Multi-Vault Identity Pill */}
          <View
            style={[
              styles.vaultIdentityCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.vaultIdentityLeft}>
              <View
                style={[
                  styles.vaultAvatar,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.vaultAvatarText,
                    { color: colors.onPrimary },
                  ]}
                >
                  {(activeVault?.name || 'P').charAt(0).toUpperCase()}
                </Text>
              </View>

              <View style={styles.vaultTextGroup}>
                <Text style={[styles.vaultUnlockingLabel, { color: colors.textDim }]}>
                  {isLoading ? 'Unlocking' : 'Active Vault'}
                </Text>
                <View style={styles.vaultNameRow}>
                  <Text
                    style={[styles.vaultNameText, { color: colors.textHeading }]}
                    numberOfLines={1}
                  >
                    {activeVault?.name || 'Personal Vault'}
                  </Text>
                  {isBioEnabledForActive && (
                    <Fingerprint
                      size={15}
                      color={colors.textMuted}
                      style={{ marginLeft: 6 }}
                    />
                  )}
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.switchVaultButton,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => {
                triggerLightHaptic();
                setShowSwitchSheet(true);
              }}
              hitSlop={HIT_SLOP}
              activeOpacity={0.75}
            >
              <Text style={[styles.switchVaultButtonText, { color: colors.text }]}>
                {vaults.length > 1 ? 'Switch' : 'Vaults'}
              </Text>
              <ChevronDown size={14} color={colors.textMuted} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {isRecoveryMode
              ? 'Enter your 24-word recovery phrase to restore access.'
              : 'Enter your Master Password to decrypt your zero-knowledge vault.'}
          </Text>
        </View>

        {/* ── Monochrome Card ── */}
        <Animated.View
          style={[
            styles.glassCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
            shakeAnimatedStyle,
          ]}
        >
          {isRecoveryMode ? (
            <View
              style={[
                styles.inputShell,
                styles.multilineShell,
                inputShellStyle('recovery'),
              ]}
            >
              <TextInput
                style={[styles.inputText, styles.multilineInput, { color: colors.text }]}
                placeholder="Enter your 24-word recovery phrase..."
                placeholderTextColor={colors.textDim}
                value={recoveryPhrase}
                onChangeText={setRecoveryPhrase}
                editable={!isLoading}
                multiline
                autoCorrect={false}
                autoCapitalize="none"
                onFocus={() => setFocusedField('recovery')}
                onBlur={() => setFocusedField(null)}
                textAlignVertical="top"
              />
            </View>
          ) : (
            <View style={[styles.inputShell, inputShellStyle('password')]}>
              <TextInput
                ref={passwordRef}
                style={[styles.inputText, { color: colors.text }]}
                placeholder={`Password for ${activeVault?.name || 'Vault'}`}
                placeholderTextColor={colors.textDim}
                value={password}
                onChangeText={setPassword}
                editable={!isLoading}
                secureTextEntry={!showPassword}
                autoCorrect={false}
                autoCapitalize="none"
                autoComplete="password"
                returnKeyType="go"
                onSubmitEditing={handleUnlock}
                blurOnSubmit={false}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
              />
              <TouchableOpacity
                style={styles.iconBtn}
                hitSlop={HIT_SLOP}
                onPress={() => {
                  triggerLightHaptic();
                  setShowPassword((v) => !v);
                }}
                activeOpacity={0.7}
              >
                {showPassword ? (
                  <EyeOff size={18} color={colors.textDim} />
                ) : (
                  <Eye size={18} color={colors.textDim} />
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Primary CTA */}
          <AnimatedPrimaryButton
            onPress={handleUnlock}
            disabled={false}
            label={isRecoveryMode ? 'Restore Vault' : 'Unlock Vault'}
            primaryColor={colors.primary}
            onPrimaryColor={colors.onPrimary}
            loading={isLoading}
          />

          {/* Error Message Toast */}
          {errorMessage && (
            <View style={styles.errorToast}>
              <AlertCircle size={15} color={colors.danger} />
              <Text style={[styles.errorToastText, { color: colors.danger }]}>
                {errorMessage}
              </Text>
            </View>
          )}

          {/* Biometrics Button */}
          {!isRecoveryMode && (
            <TouchableOpacity
              style={[
                styles.biometricBtn,
                {
                  backgroundColor: isDark ? '#27272a' : '#f4f4f5',
                  borderColor: isDark ? '#3f3f46' : '#e4e4e7',
                },
              ]}
              onPress={handleBiometricUnlock}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <Fingerprint size={19} color={isDark ? '#ffffff' : '#000000'} />
              <Text
                style={[
                  styles.biometricBtnText,
                  { color: isDark ? '#ffffff' : '#000000' },
                ]}
              >
                {isBioEnabledForActive ? 'Use Biometrics' : 'Unlock with Biometrics'}
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* ── Footer Links ── */}
        <View style={styles.footerLinks}>
          <TouchableOpacity
            style={styles.linkBtn}
            hitSlop={HIT_SLOP}
            onPress={() => {
              triggerLightHaptic();
              setIsRecoveryMode((v) => !v);
            }}
          >
            <Text style={[styles.linkText, { color: colors.text }]}>
              {isRecoveryMode
                ? 'Back to Master Password'
                : 'Lost password? Use Recovery Phrase'}
            </Text>
          </TouchableOpacity>

          {!isRecoveryMode && (
            <TouchableOpacity
              style={styles.linkBtn}
              hitSlop={HIT_SLOP}
              onPress={handleResetVault}
            >
              <Text style={[styles.dimLinkText, { color: colors.textMuted }]}>
                Forgot Password?{' '}
                <Text style={{ color: colors.text, fontWeight: '700' }}>Reset Vault</Text>
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.linkBtn}
            hitSlop={HIT_SLOP}
            onPress={() => {
              triggerLightHaptic();
              onGoToSetup();
            }}
          >
            <Text style={[styles.dimLinkText, { color: colors.textMuted }]}>
              + Create New Vault
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Switch Vault Bottom Sheet Modal (Edge-to-Edge Reanimated) ── */}
      <VaultSwitcherModal
        visible={showSwitchSheet}
        vaults={vaults}
        activeVault={activeVault}
        onSelectVault={handleSelectVault}
        onCreateVault={() => {
          setShowSwitchSheet(false);
          onGoToSetup();
        }}
        onClose={() => setShowSwitchSheet(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  header: { alignItems: 'center', marginBottom: spacing.lg },
  badge: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  badgeText: { fontFamily: 'Inter', fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  title: {
    fontFamily: 'Inter',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  vaultIdentityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.xl,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  vaultIdentityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  vaultAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  vaultAvatarText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '800',
  },
  vaultTextGroup: {
    flex: 1,
  },
  vaultUnlockingLabel: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  vaultNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vaultNameText: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  switchVaultButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  switchVaultButtonText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
  },
  subtitle: {
    fontFamily: 'Inter',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    lineHeight: 19,
  },
  glassCard: {
    width: '100%',
    borderRadius: 24,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    minHeight: 52,
    overflow: 'hidden',
  },
  multilineShell: {
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  inputText: {
    flex: 1,
    fontFamily: 'Inter',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
  },
  multilineInput: {
    minHeight: 108,
    textAlignVertical: 'top',
  },
  iconBtn: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    borderRadius: radii.pill,
    minHeight: 52,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryButtonText: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radii.pill,
    minHeight: 52,
    marginTop: spacing.md,
  },
  biometricBtnText: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  errorToast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.32)',
  },
  errorToastText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  footerLinks: { alignItems: 'center', gap: spacing.xs },
  linkBtn: {
    minHeight: layout.minTouchTarget,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: { fontFamily: 'Inter', fontSize: 14, fontWeight: '600' },
  dimLinkText: { fontFamily: 'Inter', fontSize: 13, fontWeight: '600' },
});