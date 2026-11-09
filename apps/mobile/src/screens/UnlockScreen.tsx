/**
 * @file apps/mobile/src/screens/UnlockScreen.tsx
 * @description Ultra-Premium Zero-Knowledge Vault Unlock Screen
 * Strict Monochrome (Black & White) Aesthetic — Multi-Vault Identity & Switcher,
 * Sleek SVG Logo, Hardware-Isolated Biometrics, Smooth Keyboard Handling.
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
  Modal,
  TouchableWithoutFeedback,
  Image,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
import { Eye, EyeOff, Fingerprint, ShieldCheck, ChevronDown, Check, Plus, X, AlertCircle } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useTheme,
  spacing,
  radii,
  layout,
  HIT_SLOP,
  VaultSkeletonLoader,
  triggerLightHaptic,
  triggerSuccessHaptic,
  triggerHaptic,
} from '../theme/theme';
import { mobileUnlockVault, mobileUnlockWithRecovery, clearActiveSession } from '../crypto/mobileCrypto';
import { retrieveBiometricSlotKey, hasBiometricSlotKey, clearBiometricSlotKey } from '../crypto/keychain';
import { getAllVaults, VaultRecord, purgeAllVaultData } from '../storage/db';
import { ArcaBrandLogo } from '../components/ArcaBrandLogo';

interface UnlockScreenProps {
  onUnlocked: () => void;
  onGoToSetup: () => void;
}

// ─── Animated Primary Button (Monochrome + Electric Indigo) ─────────────────
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
            shadowColor: primaryColor,
            shadowOpacity: 0.35,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          },
        ]}
      >
        <Text style={[styles.primaryButtonText, { color: onPrimaryColor }]}>
          {loading ? 'Unlocking...' : label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main UnlockScreen ────────────────────────────────────────────────────────
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
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<'password' | 'recovery' | null>(null);

  const passwordRef = useRef<TextInput>(null);

  // Load vaults and active vault
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

  // Handle switching active vault
  const handleSelectVault = async (vault: VaultRecord) => {
    triggerLightHaptic();
    setActiveVault(vault);
    await AsyncStorage.setItem('@arca_active_vault_id', vault.id).catch(() => {});
    const hasBio = await hasBiometricSlotKey(vault.id);
    setIsBioEnabledForActive(hasBio);
    setPassword('');
    setRecoveryPhrase('');
    setShowSwitchSheet(false);
  };

  // Fluid unlock exit transition
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const shakeOffset = useSharedValue(0);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  const shakeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeOffset.value }],
  }));

  const triggerShakeAnimation = useCallback(() => {
    triggerHaptic('notificationError');
    shakeOffset.value = withSequence(
      withTiming(-12, { duration: 50 }),
      withTiming(12, { duration: 50 }),
      withTiming(-9, { duration: 50 }),
      withTiming(9, { duration: 50 }),
      withTiming(-5, { duration: 50 }),
      withTiming(5, { duration: 50 }),
      withTiming(0, { duration: 50 })
    );
  }, [shakeOffset]);

  const triggerSpringUnlockTransition = useCallback(() => {
    triggerSuccessHaptic();
    opacity.value = withTiming(0, { duration: 180 });
    scale.value = withSpring(1.03, { damping: 18, stiffness: 220 });
    translateY.value = withSpring(-12, { damping: 18, stiffness: 220 }, () => {
      runOnJS(onUnlocked)();
    });
  }, [opacity, scale, translateY, onUnlocked]);

  const handleUnlock = async () => {
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

    setLoading(true);
    // Yield execution to JS event loop so the UI updates to loading state immediately
    setTimeout(async () => {
      try {
        if (isRecoveryMode) {
          await mobileUnlockWithRecovery(recoveryPhrase.trim(), activeVault?.id);
        } else {
          await mobileUnlockVault(password, activeVault?.id);
        }
        triggerSpringUnlockTransition();
      } catch (err: any) {
        setLoading(false);
        triggerShakeAnimation();
        setErrorMessage('Incorrect Master Password');
        setTimeout(() => setErrorMessage(null), 3000);
      }
    }, 40);
  };

  const handleResetVault = () => {
    triggerLightHaptic();
    Alert.alert(
      'Reset Vault?',
      `This will permanently erase all local encrypted data for "${activeVault?.name || 'this vault'}" from this device. You will need your 24-word recovery phrase to restore your data.`,
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

  const handleBiometricUnlock = async () => {
    triggerLightHaptic();
    setErrorMessage(null);
    const vaultId = activeVault?.id || 'default_vault';
    const vaultName = activeVault?.name || 'Personal Vault';
    try {
      const storedKey = await retrieveBiometricSlotKey(`Unlock "${vaultName}"`, vaultId);
      if (storedKey) {
        setLoading(true);
        setTimeout(async () => {
          try {
            await mobileUnlockVault(storedKey, vaultId);
            triggerSpringUnlockTransition();
          } catch (err: any) {
            setLoading(false);
            triggerShakeAnimation();
            setErrorMessage('Biometric key invalid or expired.');
          }
        }, 40);
      } else {
        triggerShakeAnimation();
        setErrorMessage(`Biometric not enrolled for "${vaultName}". Unlock with password first.`);
      }
    } catch (err: any) {
      setLoading(false);
      triggerShakeAnimation();
      setErrorMessage(err?.message || 'Biometric authentication failed.');
    }
  };

  // Input shell focus styling
  const inputShellStyle = (field: 'password' | 'recovery') => {
    const focused = focusedField === field;
    return {
      backgroundColor: colors.inputBackground,
      borderColor: focused ? colors.primary : 'transparent',
      shadowColor: focused ? (isDark ? '#ffffff' : '#000000') : 'transparent',
      shadowOpacity: focused ? 0.15 : 0,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 0 },
      elevation: focused ? 3 : 0,
    };
  };

  // Loading skeleton screen
  if (loading) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle={isDark ? 'light-content' : 'dark-content'}
        />
        <View style={styles.unlockingHeader}>
          <ShieldCheck size={22} color={colors.primary} />
          <Text style={[styles.unlockingHeaderText, { color: colors.textMuted }]}>
            Decrypting {activeVault?.name || 'vault'} in RAM...
          </Text>
        </View>
        <VaultSkeletonLoader />
      </View>
    );
  }

  const glassCardBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.85)';
  const glassCardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
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
        <Animated.View style={animatedContainerStyle}>
          {/* ── Header ── */}
          <View style={styles.header}>
            {/* Original Arca Logo with Monochrome Theme */}
            <ArcaBrandLogo isDark={isDark} size={80} />

            {/* Badge (Strict Monochrome, No Emoji) */}
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: colors.primaryGlow,
                  borderColor: colors.primaryBorderGlow,
                },
              ]}
            >
              <Text style={[styles.badgeText, { color: colors.primary }]}>
                {isRecoveryMode ? 'Account Recovery' : 'Zero-Knowledge Vault'}
              </Text>
            </View>

            <Text style={[styles.title, { color: colors.textHeading }]}>
              {isRecoveryMode ? 'Account Recovery' : 'Unlock Vault'}
            </Text>

            {/* Multi-Vault Identity Pill with Circular Avatar & Switch Vault Dropdown */}
            <View
              style={[
                styles.vaultIdentityCard,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f4f4f5',
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                },
              ]}
            >
              <View style={styles.vaultIdentityLeft}>
                {/* Circular Avatar */}
                <View
                  style={[
                    styles.vaultAvatar,
                    {
                      backgroundColor: isDark ? '#ffffff' : '#000000',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.vaultAvatarText,
                      { color: isDark ? '#000000' : '#ffffff' },
                    ]}
                  >
                    {(activeVault?.name || 'P').charAt(0).toUpperCase()}
                  </Text>
                </View>

                {/* Vault Name Label */}
                <View style={styles.vaultTextGroup}>
                  <Text style={[styles.vaultUnlockingLabel, { color: colors.textDim }]}>
                    Unlocking
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

              {/* Switch Vault Action Pill */}
              <TouchableOpacity
                style={[
                  styles.switchVaultButton,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#ffffff',
                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
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

          {/* ── Glass Card ── */}
          <View
            style={[
              styles.glassCard,
              { backgroundColor: glassCardBg, borderColor: glassCardBorder },
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

            {/* Primary CTA (Electric Indigo) */}
            <AnimatedPrimaryButton
              onPress={handleUnlock}
              disabled={false}
              label={isRecoveryMode ? 'Restore Vault' : 'Unlock Vault'}
              primaryColor={colors.primary}
              onPrimaryColor={colors.onPrimary}
              loading={loading}
            />

            {/* Error Message Toast / Shake */}
            {errorMessage && (
              <Animated.View style={[styles.errorToast, shakeAnimatedStyle]}>
                <AlertCircle size={15} color={colors.danger} />
                <Text style={[styles.errorToastText, { color: colors.danger }]}>
                  {errorMessage}
                </Text>
              </Animated.View>
            )}

            {/* Premium Biometrics Button */}
            {!isRecoveryMode && (
              <TouchableOpacity
                style={[
                  styles.biometricBtn,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                  },
                ]}
                onPress={handleBiometricUnlock}
                activeOpacity={0.8}
              >
                <Fingerprint size={19} color={colors.text} />
                <Text style={[styles.biometricBtnText, { color: colors.text }]}>
                  {isBioEnabledForActive ? 'Use Biometrics' : 'Unlock with Biometrics'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

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
              <Text style={[styles.linkText, { color: colors.primary }]}>
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
                  Forgot Password? <Text style={{ color: colors.danger, fontWeight: '700' }}>Reset Vault</Text>
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
        </Animated.View>
      </ScrollView>

      {/* ── Switch Vault Bottom Sheet Modal ── */}
      <Modal
        visible={showSwitchSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSwitchSheet(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowSwitchSheet(false)}>
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
                {/* Drag Handle Bar */}
                <View style={styles.sheetHandleArea}>
                  <View
                    style={[styles.sheetHandle, { backgroundColor: colors.borderSubtle }]}
                  />
                </View>

                {/* Modal Title Row */}
                <View style={styles.sheetHeader}>
                  <View>
                    <Text style={[styles.sheetTitle, { color: colors.textHeading }]}>
                      Select Vault
                    </Text>
                    <Text style={[styles.sheetSubtitle, { color: colors.textMuted }]}>
                      Isolated zero-knowledge vaults on this device
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.closeBtn}
                    hitSlop={HIT_SLOP}
                    onPress={() => setShowSwitchSheet(false)}
                  >
                    <X size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                {/* Vaults List */}
                <ScrollView style={styles.vaultListScroll} showsVerticalScrollIndicator={false}>
                  {vaults.map((v) => {
                    const isSelected = activeVault?.id === v.id;
                    return (
                      <TouchableOpacity
                        key={v.id}
                        style={[
                          styles.vaultRowItem,
                          {
                            backgroundColor: isSelected
                              ? (isDark ? 'rgba(255,255,255,0.06)' : '#f4f4f5')
                              : 'transparent',
                            borderColor: isSelected
                              ? (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)')
                              : 'transparent',
                          },
                        ]}
                        onPress={() => handleSelectVault(v)}
                        activeOpacity={0.75}
                      >
                        <View style={styles.vaultRowLeft}>
                          {/* Circular Avatar */}
                          <View
                            style={[
                              styles.vaultAvatar,
                              {
                                backgroundColor: isSelected
                                  ? (isDark ? '#ffffff' : '#000000')
                                  : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'),
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.vaultAvatarText,
                                {
                                  color: isSelected
                                    ? (isDark ? '#000000' : '#ffffff')
                                    : colors.text,
                                },
                              ]}
                            >
                              {v.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.vaultRowDetails}>
                            <Text
                              style={[
                                styles.vaultRowTitle,
                                {
                                  color: colors.textHeading,
                                  fontWeight: isSelected ? '700' : '600',
                                },
                              ]}
                            >
                              {v.name}
                            </Text>
                            <Text style={[styles.vaultRowSub, { color: colors.textDim }]}>
                              Argon2id + XChaCha20
                            </Text>
                          </View>
                        </View>

                        {isSelected && (
                          <View
                            style={[
                              styles.selectedCheckPill,
                              { backgroundColor: isDark ? '#ffffff' : '#000000' },
                            ]}
                          >
                            <Check size={14} color={isDark ? '#000000' : '#ffffff'} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Create New Vault Button inside Sheet */}
                <TouchableOpacity
                  style={[
                    styles.sheetCreateBtn,
                    {
                      borderColor: colors.border,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f4f4f5',
                    },
                  ]}
                  onPress={() => {
                    setShowSwitchSheet(false);
                    triggerLightHaptic();
                    onGoToSetup();
                  }}
                  activeOpacity={0.8}
                >
                  <Plus size={18} color={colors.text} />
                  <Text style={[styles.sheetCreateBtnText, { color: colors.text }]}>
                    Create Another Vault
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex: { flex: 1 },

  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },

  unlockingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xl,
  },
  unlockingHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
    fontFamily: 'Inter',
  },

  header: { alignItems: 'center', marginBottom: spacing.lg },
  logoContainer: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  logoImage: {
    width: 80,
    height: 80,
  },
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

  // Vault Identity Pill
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
    borderWidth: 1.5,
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
    borderWidth: 1.5,
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
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: { fontFamily: 'Inter', fontSize: 14, fontWeight: '600' },
  dimLinkText: { fontFamily: 'Inter', fontSize: 13, fontWeight: '600' },

  // Modal Bottom Sheet
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl + 8,
    maxHeight: '80%',
  },
  sheetHandleArea: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: radii.pill,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  sheetTitle: {
    fontFamily: 'Inter',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  sheetSubtitle: {
    fontFamily: 'Inter',
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  vaultListScroll: {
    maxHeight: 280,
    marginBottom: spacing.lg,
  },
  vaultRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: 8,
  },
  vaultRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  vaultRowDetails: {
    flex: 1,
  },
  vaultRowTitle: {
    fontFamily: 'Inter',
    fontSize: 15,
    letterSpacing: -0.2,
  },
  vaultRowSub: {
    fontFamily: 'Inter',
    fontSize: 11,
    marginTop: 2,
  },
  selectedCheckPill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radii.pill,
    minHeight: 50,
  },
  sheetCreateBtnText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
  },
});
