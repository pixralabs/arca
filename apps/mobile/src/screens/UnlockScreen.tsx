/**
 * @file apps/mobile/src/screens/UnlockScreen.tsx
 * @description Ultra-Premium Zero-Knowledge Vault Unlock Screen
 * Strict Monochrome (Black & White) Aesthetic — Native C++ JSI Argon2id (< 200ms),
 * Hardware-Backed Biometric Key Wrapping (StrongBox + CryptoObject / Secure Enclave),
 * Edge-to-Edge OLED Black Canvas with Floating Gesture Navigation, Minimalist Vault Pill,
 * and Shake Error Feedback.
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  useKeyboardHeight,
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
  yieldToMainThread,
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
  const insets = useSafeAreaInsets();
  const { keyboardHeight } = useKeyboardHeight();
  const scrollViewRef = useRef<ScrollView>(null);
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
  const biometricAttemptsRef = useRef(0);

  // Allow screenshots for user review & visual feedback
  useEffect(() => {
    setFlagSecure(false);
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
    await yieldToMainThread(16);

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
      setErrorMessage(isRecoveryMode ? 'Invalid recovery phrase' : 'Incorrect Master Password');
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
      biometricAttemptsRef.current = 0;
      triggerSuccessHaptic();
      onUnlocked();
    } catch (err: any) {
      setIsLoading(false);
      biometricAttemptsRef.current += 1;
      const msg = err?.message || '';
      if (
        msg.toLowerCase().includes('cancel') ||
        msg.toLowerCase().includes('user cancellation')
      ) {
        if (biometricAttemptsRef.current >= 3) {
          setErrorMessage('Biometric prompt dismissed. Please enter your Master Password.');
          passwordRef.current?.focus();
        }
        return;
      }
      triggerShakeAnimation();
      if (
        biometricAttemptsRef.current >= 3 ||
        msg.toLowerCase().includes('lockout') ||
        msg.toLowerCase().includes('too many') ||
        msg.toLowerCase().includes('denied')
      ) {
        setErrorMessage('Biometric attempts exceeded. Please unlock using your Master Password.');
        passwordRef.current?.focus();
      } else {
        setErrorMessage(msg || 'Biometric key invalid or authentication failed.');
      }
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
      backgroundColor: isDark ? '#141417' : '#f4f4f5',
      borderColor: focused ? (isDark ? '#ffffff' : '#000000') : (isDark ? '#27272a' : '#e4e4e7'),
    };
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={isDark ? 'light-content' : 'dark-content'}
      />

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + spacing.lg,
            paddingBottom: keyboardHeight > 0 ? keyboardHeight + 60 : insets.bottom + spacing.xl,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Brand & Screen Title ── */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <ArcaBrandLogo isDark={isDark} size={68} />
          </View>

          <Text style={[styles.title, { color: colors.textHeading }]}>
            {isRecoveryMode ? 'Account Recovery' : 'Unlock Vault'}
          </Text>

          {/* Minimalist Active Vault Pill */}
          {!isRecoveryMode && (
            <TouchableOpacity
              style={[
                styles.vaultPill,
                {
                  backgroundColor: isDark ? '#141417' : '#f4f4f5',
                  borderColor: isDark ? '#27272a' : '#e4e4e7',
                },
              ]}
              onPress={() => {
                triggerLightHaptic();
                setShowSwitchSheet(true);
              }}
              hitSlop={HIT_SLOP}
              activeOpacity={0.75}
            >
              <Text
                style={[styles.vaultPillText, { color: colors.text }]}
                numberOfLines={1}
              >
                {activeVault?.name || 'Personal Vault'}
              </Text>
              {isBioEnabledForActive && (
                <Fingerprint
                  size={14}
                  color={colors.textMuted}
                  style={{ marginLeft: 6 }}
                />
              )}
              {vaults.length > 1 && (
                <ChevronDown
                  size={14}
                  color={colors.textMuted}
                  style={{ marginLeft: 4 }}
                />
              )}
            </TouchableOpacity>
          )}

          {isRecoveryMode && (
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Enter your 24-word recovery phrase to restore your vault on this device.
            </Text>
          )}
        </View>

        {/* ── Main Input & Action Card ── */}
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? '#121214' : '#ffffff',
              borderColor: isDark ? '#27272a' : '#e4e4e7',
            },
            shakeAnimatedStyle,
          ]}
        >
          {isRecoveryMode ? (
            <View
              collapsable={false}
              style={[
                styles.inputShell,
                styles.multilineShell,
                inputShellStyle('recovery'),
              ]}
            >
              <TextInput
                collapsable={false}
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
            <View collapsable={false} style={[styles.inputShell, inputShellStyle('password')]}>
              <TextInput
                ref={passwordRef}
                collapsable={false}
                style={[styles.inputText, { color: colors.text }]}
                placeholder="Master Password"
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

          {/* Error Message Toast */}
          {errorMessage && (
            <View style={styles.errorToast}>
              <AlertCircle size={15} color={colors.danger} />
              <Text style={[styles.errorToastText, { color: colors.danger }]}>
                {errorMessage}
              </Text>
            </View>
          )}

          {/* Primary CTA Button: Pure White Pill */}
          <AnimatedPrimaryButton
            onPress={handleUnlock}
            disabled={false}
            label={isRecoveryMode ? 'Restore Vault' : 'Unlock Vault'}
            primaryColor={isDark ? '#ffffff' : '#000000'}
            onPrimaryColor={isDark ? '#000000' : '#ffffff'}
            loading={isLoading}
          />

          {/* Biometrics Secondary Button */}
          {!isRecoveryMode && (
            <TouchableOpacity
              style={[
                styles.biometricBtn,
                {
                  backgroundColor: isDark ? '#1a1a1e' : '#f4f4f5',
                  borderColor: isDark ? '#2e2e33' : '#e4e4e7',
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

        {/* ── Footer Links (Streamlined & Clean) ── */}
        <View style={styles.footerLinks}>
          <TouchableOpacity
            style={styles.linkBtn}
            hitSlop={HIT_SLOP}
            onPress={() => {
              triggerLightHaptic();
              setIsRecoveryMode((v) => !v);
              setErrorMessage(null);
            }}
          >
            <Text style={[styles.linkText, { color: colors.text }]}>
              {isRecoveryMode
                ? 'Back to Master Password'
                : 'Restore with Recovery Phrase'}
            </Text>
          </TouchableOpacity>

          {!isRecoveryMode && (
            <TouchableOpacity
              style={styles.linkBtn}
              hitSlop={HIT_SLOP}
              onPress={handleResetVault}
            >
              <Text style={[styles.dimLinkText, { color: colors.textMuted }]}>
                Reset Vault
              </Text>
            </TouchableOpacity>
          )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoContainer: {
    marginBottom: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Inter',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  vaultPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    marginTop: 4,
  },
  vaultPillText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  subtitle: {
    fontFamily: 'Inter',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    lineHeight: 19,
    marginTop: spacing.xs,
  },
  card: {
    width: '100%',
    borderRadius: 24,
    padding: spacing.lg,
    borderWidth: 1,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1.2,
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
  footerLinks: {
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: 2,
  },
  linkBtn: {
    minHeight: layout.minTouchTarget,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  dimLinkText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
});
