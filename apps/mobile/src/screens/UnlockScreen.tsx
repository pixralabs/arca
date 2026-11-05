/**
 * @file apps/mobile/src/screens/UnlockScreen.tsx
 * @description Arca Mobile — Zero-Knowledge Vault Unlock Screen with Monochrome + Electric Indigo
 * Palette, Reanimated Spring Transitions, Shimmering Skeleton Loader while Unlocking,
 * Soft Focus-Glow Inputs, Keyboard Awareness, and Tactile Haptic Feedback.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Eye, EyeOff, Fingerprint, ShieldCheck } from 'lucide-react-native';
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
import { mobileUnlockVault, mobileUnlockWithRecovery } from '../crypto/mobileCrypto';
import { retrieveBiometricSlotKey } from '../crypto/keychain';

interface UnlockScreenProps {
  onUnlocked: () => void;
  onGoToSetup: () => void;
}

export function UnlockScreen({ onUnlocked, onGoToSetup }: UnlockScreenProps) {
  const { colors, typography } = useTheme();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<'password' | 'recovery' | null>(null);

  // Reanimated spring values for fluid unlock exit
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  const triggerSpringUnlockTransition = () => {
    triggerSuccessHaptic();
    opacity.value = withTiming(0, { duration: 180 });
    scale.value = withSpring(1.03, { damping: 18, stiffness: 220 });
    translateY.value = withSpring(-12, { damping: 18, stiffness: 220 }, () => {
      runOnJS(onUnlocked)();
    });
  };

  const handleUnlock = async () => {
    triggerLightHaptic();
    if (!isRecoveryMode && !password) {
      Alert.alert('Required', 'Please enter your Master Password.');
      return;
    }
    if (isRecoveryMode && !recoveryPhrase) {
      Alert.alert('Required', 'Please enter your 24-word recovery phrase.');
      return;
    }

    setLoading(true);
    try {
      if (isRecoveryMode) {
        await mobileUnlockWithRecovery(recoveryPhrase.trim());
      } else {
        await mobileUnlockVault(password);
      }
      triggerSpringUnlockTransition();
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Unlock Failed', err?.message || 'Invalid Master Password.');
    }
  };

  const handleBiometricUnlock = async () => {
    triggerLightHaptic();
    try {
      const storedKey = await retrieveBiometricSlotKey();
      if (storedKey) {
        setLoading(true);
        await mobileUnlockVault(storedKey);
        triggerSpringUnlockTransition();
      } else {
        Alert.alert('Biometrics', 'Biometric credential not available.');
      }
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Biometric Error', err?.message || 'Biometric authentication failed.');
    }
  };

  // While the vault is unlocking, show smooth shimmering skeletons instead of a spinner
  if (loading) {
    return (
      <View style={[styles.skeletonWrapper, { backgroundColor: colors.background }]}>
        <View style={styles.unlockingHeader}>
          <ShieldCheck size={22} color={colors.primary} />
          <Text
            style={[
              styles.unlockingHeaderText,
              { color: colors.textMuted, fontFamily: typography.fontFamily },
            ]}
          >
            Decrypting zero-knowledge vault in RAM...
          </Text>
        </View>
        <VaultSkeletonLoader />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.keyboardRoot, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.container, animatedContainerStyle]}>
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
                Arca by Pixra
              </Text>
            </View>
            <Text style={[styles.title, { color: colors.textHeading }]}>
              {isRecoveryMode ? 'Account Recovery' : 'Unlock Vault'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {isRecoveryMode
                ? 'Enter your 24-word recovery phrase to restore access.'
                : 'Enter your Master Password to decrypt your zero-knowledge vault.'}
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
            {isRecoveryMode ? (
              <View
                style={[
                  styles.inputShell,
                  styles.multilineShell,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor:
                      focusedField === 'recovery' ? colors.primary : 'transparent',
                  },
                  focusedField === 'recovery' && {
                    shadowColor: colors.primary,
                    shadowOpacity: 0.28,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 0 },
                  },
                ]}
              >
                <TextInput
                  style={[
                    styles.input,
                    styles.multilineInput,
                    { color: colors.text },
                  ]}
                  placeholder="Enter 24-word recovery phrase..."
                  placeholderTextColor={colors.textDim}
                  value={recoveryPhrase}
                  onChangeText={setRecoveryPhrase}
                  onFocus={() => setFocusedField('recovery')}
                  onBlur={() => setFocusedField(null)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                />
              </View>
            ) : (
              <View
                style={[
                  styles.inputShell,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor:
                      focusedField === 'password' ? colors.primary : 'transparent',
                  },
                  focusedField === 'password' && {
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
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
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
                    <EyeOff size={20} color={colors.textMuted} />
                  ) : (
                    <Eye size={20} color={colors.textMuted} />
                  )}
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: colors.primary },
              ]}
              onPress={handleUnlock}
              activeOpacity={0.85}
            >
              <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                {isRecoveryMode ? 'Restore Vault' : 'Unlock Vault'}
              </Text>
            </TouchableOpacity>

            {!isRecoveryMode && (
              <TouchableOpacity
                style={[
                  styles.secondaryButton,
                  { backgroundColor: colors.surfaceSubtle },
                ]}
                onPress={handleBiometricUnlock}
                activeOpacity={0.8}
              >
                <Fingerprint size={18} color={colors.primary} />
                <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
                  Use Biometrics
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.footerLinks}>
            <TouchableOpacity
              style={styles.linkButton}
              hitSlop={HIT_SLOP}
              onPress={() => {
                triggerLightHaptic();
                setIsRecoveryMode(!isRecoveryMode);
              }}
            >
              <Text style={[styles.linkButtonText, { color: colors.primary }]}>
                {isRecoveryMode
                  ? 'Back to Master Password'
                  : 'Lost Master Password? Use Recovery Phrase'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              hitSlop={HIT_SLOP}
              onPress={() => {
                triggerLightHaptic();
                onGoToSetup();
              }}
            >
              <Text style={[styles.dimLinkText, { color: colors.textMuted }]}>
                Create New Vault
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  container: {
    width: '100%',
    justifyContent: 'center',
  },
  skeletonWrapper: {
    flex: 1,
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
    marginBottom: spacing.lg,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1.5,
    marginBottom: spacing.md,
    minHeight: 54,
  },
  multilineShell: {
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  inputWithActions: {
    flex: 1,
    fontFamily: 'Inter',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  eyeButton: {
    minWidth: layout.minTouchTarget,
    minHeight: layout.minTouchTarget,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  multilineInput: {
    minHeight: 108,
    textAlignVertical: 'top',
  },
  primaryButton: {
    borderRadius: radii.pill, // 9999 pill-shaped
    minHeight: layout.minButtonHeight, // >= 52px
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  primaryButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  secondaryButton: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radii.pill, // 9999 pill-shaped
    minHeight: layout.minButtonHeight, // >= 52px
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  footerLinks: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  linkButton: {
    minHeight: layout.minTouchTarget,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkButtonText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
  },
  dimLinkText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '500',
  },
});