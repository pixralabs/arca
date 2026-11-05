/**
 * @file apps/mobile/src/screens/SetupScreen.tsx
 * @description Arca Mobile — Zero-Knowledge Vault Creation and BIP-39 Recovery Phrase Screen
 * with Monochrome + Electric Indigo Palette, Pill Buttons (minHeight 52), 24px Curvy Cards,
 * Focus-Glow Soft Inputs, Keyboard Awareness, Shimmering Skeleton State, and Tactile Haptics.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Eye, EyeOff, Sparkles, ShieldCheck } from 'lucide-react-native';
import {
  useTheme,
  spacing,
  radii,
  layout,
  HIT_SLOP,
  VaultSkeletonLoader,
  triggerLightHaptic,
  triggerSuccessHaptic,
} from '../theme/theme';
import { mobileSetupVault } from '../crypto/mobileCrypto';

interface SetupScreenProps {
  onVaultCreated: () => void;
  onGoToUnlock: () => void;
}

export function SetupScreen({ onVaultCreated, onGoToUnlock }: SetupScreenProps) {
  const { colors } = useTheme();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [confirmedBackup, setConfirmedBackup] = useState(false);
  const [focusedInput, setFocusedInput] = useState<'master' | 'confirm' | null>(null);

  const strengthAudit = useMemo(() => {
    if (!password) {
      return { score: 0, isWeak: true, reasons: [] };
    }
    const { auditPasswordStrength } = require('@vaultguard/crypto');
    return auditPasswordStrength(password);
  }, [password]);

  const strengthColor = useMemo(() => {
    if (!password) return 'transparent';
    if (strengthAudit.score >= 80) return colors.primary;
    if (strengthAudit.score >= 50) return colors.warning;
    return colors.danger;
  }, [password, strengthAudit.score, colors]);

  const strengthLabel = useMemo(() => {
    if (!password) return '';
    if (strengthAudit.score >= 80) return 'Strong (High Entropy)';
    if (strengthAudit.score >= 50) return 'Fair (Add symbols / numbers)';
    return 'Weak (Min 12 chars & mixed characters)';
  }, [password, strengthAudit.score]);

  const handleGeneratePassword = async () => {
    triggerLightHaptic();
    try {
      const { generatePassword } = require('@vaultguard/crypto');
      const generated = await generatePassword({
        length: 24,
      });
      setPassword(generated);
      setConfirmPassword(generated);
      setShowPassword(true);
      setShowConfirmPassword(true);
      triggerSuccessHaptic();
    } catch {
      Alert.alert('Error', 'Failed to generate password');
    }
  };

  const handleCreateVault = async () => {
    triggerLightHaptic();
    if (password.length < 12) {
      Alert.alert('Weak Password', 'Master Password must be at least 12 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Mismatch', 'Master Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await mobileSetupVault(password);
      triggerSuccessHaptic();
      setMnemonic(res.mnemonic);
    } catch (err: any) {
      Alert.alert('Creation Failed', err?.message || 'Failed to initialize vault.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    triggerLightHaptic();
    if (!confirmedBackup) {
      Alert.alert(
        'Confirmation Required',
        'Please confirm that you have saved your recovery phrase.'
      );
      return;
    }
    triggerSuccessHaptic();
    onVaultCreated();
  };

  if (loading) {
    return (
      <View style={[styles.skeletonRoot, { backgroundColor: colors.background }]}>
        <View style={styles.skeletonBanner}>
          <ShieldCheck size={20} color={colors.primary} />
          <Text style={[styles.skeletonBannerText, { color: colors.textMuted }]}>
            Deriving Argon2id keys & sealing zero-knowledge vault...
          </Text>
        </View>
        <VaultSkeletonLoader />
      </View>
    );
  }

  if (mnemonic) {
    const words = mnemonic.split(' ');
    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[
          styles.scrollContainer,
          { backgroundColor: colors.background },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
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
              24-Word Recovery Phrase
            </Text>
          </View>
          <Text style={[styles.title, { color: colors.textHeading }]}>
            Emergency Recovery Kit
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Write down these 24 words in exact order. Store them in a secure physical location.
            Pixra does not keep a copy and cannot recover your vault without them.
          </Text>
        </View>

        <View
          style={[
            styles.mnemonicCard,
            {
              backgroundColor: colors.surface,
            },
          ]}
        >
          <View style={styles.grid}>
            {words.map((word, idx) => (
              <View
                key={idx}
                style={[
                  styles.wordBadge,
                  { backgroundColor: colors.surfaceSubtle },
                ]}
              >
                <Text style={[styles.wordIndex, { color: colors.textDim }]}>
                  {idx + 1}.
                </Text>
                <Text style={[styles.wordText, { color: colors.text }]}>{word}</Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={styles.checkboxContainer}
          hitSlop={HIT_SLOP}
          onPress={() => {
            triggerLightHaptic();
            setConfirmedBackup(!confirmedBackup);
          }}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.checkbox,
              { borderColor: colors.borderSubtle },
              confirmedBackup && {
                backgroundColor: colors.primary,
                borderColor: colors.primary,
              },
            ]}
          >
            {confirmedBackup && (
              <Text style={[styles.checkmark, { color: colors.onPrimary }]}>✓</Text>
            )}
          </View>
          <Text style={[styles.checkboxLabel, { color: colors.textMuted }]}>
            I have securely written down and stored my 24 recovery words.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: colors.primary },
            !confirmedBackup && styles.buttonDisabled,
          ]}
          onPress={handleFinish}
          disabled={!confirmedBackup}
          activeOpacity={0.85}
        >
          <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
            Enter My Vault
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.keyboardRoot, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollCenterContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Image
            source={require('../assets/icon_transparent.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
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
              Zero-Knowledge Setup
            </Text>
          </View>
          <Text style={[styles.title, { color: colors.textHeading }]}>
            Create Master Password
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            This password encrypts your vault with Argon2id and XChaCha20-Poly1305.
            Choose a strong, unique passphrase.
          </Text>
        </View>

        <View
          style={[
            styles.formCard,
            {
              backgroundColor: colors.surface,
            },
          ]}
        >
          {/* Master Password Input with Generate and Visibility Toggle */}
          <View
            style={[
              styles.inputContainer,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor:
                  focusedInput === 'master' ? colors.primary : 'transparent',
              },
              focusedInput === 'master' && {
                shadowColor: colors.primary,
                shadowOpacity: 0.28,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 0 },
              },
            ]}
          >
            <TextInput
              style={[styles.inputWithActions, { color: colors.text }]}
              placeholder="Enter Master Password"
              placeholderTextColor={colors.textDim}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocusedInput('master')}
              onBlur={() => setFocusedInput(null)}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.inputActions}>
              <TouchableOpacity
                style={[
                  styles.generateButton,
                  {
                    backgroundColor: colors.primaryGlow,
                    borderColor: colors.primaryBorderGlow,
                  },
                ]}
                hitSlop={HIT_SLOP}
                onPress={handleGeneratePassword}
                activeOpacity={0.75}
                accessibilityLabel="Generate strong password"
              >
                <Sparkles size={14} color={colors.primary} />
                <Text style={[styles.generateButtonText, { color: colors.primary }]}>
                  Generate
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.eyeButton}
                hitSlop={HIT_SLOP}
                onPress={() => {
                  triggerLightHaptic();
                  setShowPassword(!showPassword);
                }}
                activeOpacity={0.7}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff size={19} color={colors.textMuted} />
                ) : (
                  <Eye size={19} color={colors.textMuted} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Password Strength Progress Bar */}
          {password.length > 0 && (
            <View style={styles.strengthMeterContainer}>
              <View
                style={[
                  styles.strengthTrack,
                  { backgroundColor: colors.surfaceSubtle },
                ]}
              >
                <View
                  style={[
                    styles.strengthBar,
                    {
                      width: `${Math.max(10, strengthAudit.score)}%`,
                      backgroundColor: strengthColor,
                    },
                  ]}
                />
              </View>
              <View style={styles.strengthMetaRow}>
                <Text style={[styles.strengthLabelText, { color: strengthColor }]}>
                  {strengthLabel}
                </Text>
                <Text style={[styles.strengthScoreText, { color: colors.textMuted }]}>
                  {strengthAudit.score}%
                </Text>
              </View>
            </View>
          )}

          {/* Confirm Password Input with Visibility Toggle */}
          <View
            style={[
              styles.inputContainer,
              {
                marginTop: spacing.md,
                backgroundColor: colors.surfaceSubtle,
                borderColor:
                  focusedInput === 'confirm' ? colors.primary : 'transparent',
              },
              focusedInput === 'confirm' && {
                shadowColor: colors.primary,
                shadowOpacity: 0.28,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 0 },
              },
            ]}
          >
            <TextInput
              style={[styles.inputWithActions, { color: colors.text }]}
              placeholder="Confirm Master Password"
              placeholderTextColor={colors.textDim}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              onFocus={() => setFocusedInput('confirm')}
              onBlur={() => setFocusedInput(null)}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.inputActions}>
              <TouchableOpacity
                style={styles.eyeButton}
                hitSlop={HIT_SLOP}
                onPress={() => {
                  triggerLightHaptic();
                  setShowConfirmPassword(!showConfirmPassword);
                }}
                activeOpacity={0.7}
                accessibilityLabel={
                  showConfirmPassword ? 'Hide password' : 'Show password'
                }
              >
                {showConfirmPassword ? (
                  <EyeOff size={19} color={colors.textMuted} />
                ) : (
                  <Eye size={19} color={colors.textMuted} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Password Match Indicator */}
          {confirmPassword.length > 0 && (
            <View style={styles.matchIndicator}>
              <Text
                style={[
                  styles.matchText,
                  {
                    color:
                      password === confirmPassword ? colors.primary : colors.danger,
                  },
                ]}
              >
                {password === confirmPassword
                  ? '✓ Passwords match'
                  : '✕ Passwords do not match'}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: colors.primary },
              loading && styles.buttonDisabled,
            ]}
            onPress={handleCreateVault}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
              Initialize Zero-Knowledge Vault
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.linkButton}
          hitSlop={HIT_SLOP}
          onPress={() => {
            triggerLightHaptic();
            onGoToUnlock();
          }}
        >
          <Text style={[styles.linkButtonText, { color: colors.primary }]}>
            Already have a vault? Unlock
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  skeletonRoot: {
    flex: 1,
  },
  skeletonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xl,
  },
  skeletonBannerText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollCenterContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  scrollContainer: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoImage: {
    width: 72,
    height: 72,
    marginBottom: spacing.md,
  },
  badge: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginBottom: spacing.md,
  },
  badgeText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  title: {
    fontFamily: 'Inter',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    lineHeight: 20,
  },
  formCard: {
    width: '100%',
    borderRadius: radii.card, // 24px curvy surface
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: radii.lg,
    minHeight: 54,
  },
  inputWithActions: {
    flex: 1,
    fontFamily: 'Inter',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
  },
  inputActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.xs,
    gap: 4,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    minHeight: 36,
  },
  generateButtonText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '700',
  },
  eyeButton: {
    minWidth: layout.minTouchTarget,
    minHeight: layout.minTouchTarget,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strengthMeterContainer: {
    marginTop: 8,
    marginBottom: 4,
  },
  strengthTrack: {
    height: 5,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  strengthBar: {
    height: '100%',
    borderRadius: radii.pill,
  },
  strengthMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  strengthLabelText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
  },
  strengthScoreText: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  matchIndicator: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  matchText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
  },
  primaryButton: {
    borderRadius: radii.pill, // 9999 pill-shaped
    minHeight: layout.minButtonHeight, // >= 52px
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  primaryButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  linkButton: {
    minHeight: layout.minTouchTarget,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkButtonText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
  },
  mnemonicCard: {
    borderRadius: radii.card, // 24px curvy card
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  wordBadge: {
    width: '48.2%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
  },
  wordIndex: {
    fontSize: 12,
    width: 26,
    fontFamily: 'monospace',
  },
  wordText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.minTouchTarget,
    marginBottom: spacing.lg,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    marginRight: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontFamily: 'Inter',
    fontSize: 13,
    flex: 1,
    lineHeight: 19,
  },
});