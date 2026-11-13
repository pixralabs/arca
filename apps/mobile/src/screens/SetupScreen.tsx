/**
 * @file apps/mobile/src/screens/SetupScreen.tsx
 * @description Ultra-Premium Zero-Knowledge Vault Setup Screen
 * Strict Monochrome (Black & White) Aesthetic — Vault Name Input,
 * Sleek SVG Logo, Reanimated Spring Press, Smooth Keyboard Handling.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from '../components/SafeAreaView';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Eye, EyeOff, Sparkles, ArrowLeft } from 'lucide-react-native';
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
import { getAllVaults, VaultRecord } from '../storage/db';
import { ArcaBrandLogo } from '../components/ArcaBrandLogo';
import { RecoveryKitScreen } from './RecoveryKitScreen';

interface SetupScreenProps {
  onVaultCreated: (vaultId?: string) => void;
  onGoToUnlock: () => void;
}

// ─── Animated Primary Button (Strict Monochrome) ─────────────────────────────
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color={onPrimaryColor} />
            <Text style={[styles.primaryButtonText, { color: onPrimaryColor }]}>{label}</Text>
          </View>
        ) : (
          <Text style={[styles.primaryButtonText, { color: onPrimaryColor }]}>{label}</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main SetupScreen ─────────────────────────────────────────────────────────
export function SetupScreen({ onVaultCreated, onGoToUnlock }: SetupScreenProps) {
  const { colors, isDark } = useTheme();

  const [existingVaults, setExistingVaults] = useState<VaultRecord[]>([]);
  const [vaultName, setVaultName] = useState('Personal Vault');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState('');
  const [focusedField, setFocusedField] = useState<'name' | 'pass' | 'confirm' | null>(null);
  const [mnemonicWords, setMnemonicWords] = useState<string[]>([]);
  const [createdVaultId, setCreatedVaultId] = useState<string>('');

  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  useEffect(() => {
    getAllVaults().then((vaults) => {
      setExistingVaults(vaults);
      if (vaults.length > 0) {
        setVaultName(`Vault ${vaults.length + 1}`);
      }
    }).catch(() => {});
  }, []);

  // Password strength (0–4)
  const passwordStrength = useCallback((p: string) => {
    let score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 14) score++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
    if (/\d/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    return Math.min(score, 4);
  }, []);

  const strength = passwordStrength(password);
  const strengthColors = ['#ef4444', '#f97316', '#eab308', '#a1a1aa', '#ffffff'];
  const strengthLabels = ['Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];

  const handleGenerate = useCallback(() => {
    triggerLightHaptic();
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghijkmnopqrstuvwxyz';
    const numbers = '23456789';
    const symbols = '!@#$%^&*_-+=';
    const all = uppercase + lowercase + numbers + symbols;

    let pass = '';
    for (let i = 0; i < 4; i++) pass += uppercase[Math.floor(Math.random() * uppercase.length)];
    for (let i = 0; i < 4; i++) pass += lowercase[Math.floor(Math.random() * lowercase.length)];
    for (let i = 0; i < 4; i++) pass += numbers[Math.floor(Math.random() * numbers.length)];
    for (let i = 0; i < 4; i++) pass += symbols[Math.floor(Math.random() * symbols.length)];
    for (let i = 0; i < 4; i++) pass += all[Math.floor(Math.random() * all.length)];

    const shuffled = pass.split('').sort(() => 0.5 - Math.random()).join('');
    setPassword(shuffled);
    setConfirmPassword(shuffled);
  }, []);

  const handleSetup = useCallback(async () => {
    triggerLightHaptic();
    const cleanName = vaultName.trim();
    if (!cleanName) {
      Alert.alert('Required', 'Please enter a name for your vault.');
      return;
    }
    if (!password) {
      Alert.alert('Required', 'Please enter a Master Password.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }
    if (strength < 2) {
      Alert.alert('Weak Password', 'Please choose a stronger password.');
      return;
    }

    setLoading(true);
    setProgressStep('Deriving Master Key...');
    // Yield to the React Native event loop so the UI updates cleanly
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      const result = await mobileSetupVault(password, cleanName, (step) => {
        setProgressStep(step);
      });
      triggerSuccessHaptic();
      setCreatedVaultId(result.vaultId);
      if (result?.mnemonic) {
        setMnemonicWords(result.mnemonic.split(' '));
      } else {
        onVaultCreated(result.vaultId);
      }
    } catch (err: any) {
      setLoading(false);
      setProgressStep('');
      Alert.alert('Setup Failed', err?.message || 'Could not initialize vault.');
    }
  }, [vaultName, password, confirmPassword, strength, onVaultCreated]);

  // Input shell focus styling
  const inputShellStyle = (field: 'name' | 'pass' | 'confirm') => {
    const focused = focusedField === field;
    return {
      backgroundColor: colors.inputBackground,
      borderColor: focused ? colors.primary : 'transparent',
      shadowColor: focused ? colors.primary : 'transparent',
      shadowOpacity: focused ? (isDark ? 0.2 : 0.15) : 0,
      shadowRadius: focused ? 8 : 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: focused ? 3 : 0,
    };
  };

  // Shamir 2-of-3 Recovery Kit & Backup screen
  if (mnemonicWords.length > 0) {
    return (
      <RecoveryKitScreen
        vaultName={vaultName}
        mnemonicWords={mnemonicWords}
        onComplete={() => {
          triggerSuccessHaptic();
          onVaultCreated(createdVaultId);
        }}
      />
    );
  }

  // Glass card aesthetic
  const glassCardBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.85)';
  const glassCardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

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
        {/* Top Back Button if existing vaults are present */}
        {existingVaults.length > 0 && (
          <TouchableOpacity
            style={styles.topBackNav}
            hitSlop={HIT_SLOP}
            onPress={() => {
              triggerLightHaptic();
              onGoToUnlock();
            }}
          >
            <ArrowLeft size={18} color={colors.textMuted} />
            <Text style={[styles.topBackNavText, { color: colors.textMuted }]}>
              Back to Unlock
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Header ── */}
        <View style={styles.header}>
          {/* Original Arca Logo with Monochrome Theme */}
          <ArcaBrandLogo isDark={isDark} size={80} />

          {/* Badge (Strict Monochrome, No Emoji) */}
          <View
            style={[
              styles.badge,
              {
                backgroundColor: isDark ? '#18181b' : '#f4f4f5',
                borderColor: isDark ? '#27272a' : '#e4e4e7',
              },
            ]}
          >
            <Text style={[styles.badgeText, { color: colors.textHeading }]}>
              Zero-Knowledge Setup
            </Text>
          </View>

          <Text style={[styles.title, { color: colors.textHeading }]}>
            {existingVaults.length > 0 ? 'Create New Vault' : 'Create Master Password'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Encrypted with Argon2id + XChaCha20-Poly1305.{'\n'}Each vault is completely isolated.
          </Text>
        </View>

        {/* ── Glass Card ── */}
        <View
          style={[
            styles.glassCard,
            { backgroundColor: glassCardBg, borderColor: glassCardBorder },
          ]}
        >
          {/* 1. Vault Name Field */}
          <View style={styles.fieldBlock}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Vault Name</Text>
            <View style={[styles.inputShell, inputShellStyle('name')]}>
              <TextInput
                style={[styles.inputText, { color: colors.text }]}
                placeholder="e.g. Personal Vault, Work, Finances"
                placeholderTextColor={colors.textDim}
                value={vaultName}
                onChangeText={setVaultName}
                editable={!loading}
                autoCorrect={false}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => passwordRef.current?.focus()}
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </View>

          {/* 2. Master Password Field */}
          <View style={[styles.fieldBlock, { marginTop: spacing.md }]}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Master Password</Text>
            <View style={[styles.inputShell, inputShellStyle('pass')]}>
              <TextInput
                ref={passwordRef}
                style={[styles.inputText, { color: colors.text }]}
                placeholder="Enter Master Password"
                placeholderTextColor={colors.textDim}
                value={password}
                onChangeText={setPassword}
                editable={!loading}
                secureTextEntry={!showPassword}
                autoCorrect={false}
                autoCapitalize="none"
                autoComplete="password-new"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => confirmRef.current?.focus()}
                onFocus={() => setFocusedField('pass')}
                onBlur={() => setFocusedField(null)}
              />
              <View style={styles.inputActions}>
                <TouchableOpacity
                  style={[
                    styles.generateBtn,
                    {
                      backgroundColor: isDark ? '#27272a' : '#f4f4f5',
                      borderColor: isDark ? '#3f3f46' : '#e4e4e7',
                      opacity: loading ? 0.4 : 1,
                    },
                  ]}
                  onPress={handleGenerate}
                  disabled={loading}
                  hitSlop={HIT_SLOP}
                  activeOpacity={0.75}
                >
                  <Sparkles size={11} color={isDark ? '#ffffff' : '#000000'} />
                  <Text style={[styles.generateBtnText, { color: isDark ? '#ffffff' : '#000000' }]}>Generate</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconBtn}
                  hitSlop={HIT_SLOP}
                  disabled={loading}
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
            </View>
          </View>

          {/* Strength Bar */}
          {password.length > 0 && (
            <View style={styles.strengthMeter}>
              <View style={[styles.strengthTrack, { backgroundColor: colors.surfaceSubtle }]}>
                <View
                  style={[
                    styles.strengthFill,
                    {
                      width: `${((strength + 1) / 5) * 100}%` as any,
                      backgroundColor: strengthColors[strength],
                    },
                  ]}
                />
              </View>
              <View style={styles.strengthRow}>
                <Text style={[styles.strengthLabel, { color: strengthColors[strength] }]}>
                  {strengthLabels[strength]}
                </Text>
                <Text style={[styles.strengthScore, { color: colors.textDim }]}>
                  {password.length} chars
                </Text>
              </View>
            </View>
          )}

          {/* 3. Confirm Password Field */}
          <View style={[styles.fieldBlock, { marginTop: spacing.md }]}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Confirm Master Password</Text>
            <View style={[styles.inputShell, inputShellStyle('confirm')]}>
              <TextInput
                ref={confirmRef}
                style={[styles.inputText, { color: colors.text }]}
                placeholder="Confirm Master Password"
                placeholderTextColor={colors.textDim}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!loading}
                secureTextEntry={!showConfirmPassword}
                autoCorrect={false}
                autoCapitalize="none"
                autoComplete="password-new"
                returnKeyType="go"
                onSubmitEditing={handleSetup}
                onFocus={() => setFocusedField('confirm')}
                onBlur={() => setFocusedField(null)}
              />
              <TouchableOpacity
                style={styles.iconBtn}
                hitSlop={HIT_SLOP}
                disabled={loading}
                onPress={() => {
                  triggerLightHaptic();
                  setShowConfirmPassword((v) => !v);
                }}
                activeOpacity={0.7}
              >
                {showConfirmPassword ? (
                  <EyeOff size={18} color={colors.textDim} />
                ) : (
                  <Eye size={18} color={colors.textDim} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Match Indicator */}
          {confirmPassword.length > 0 && (
            <Text
              style={[
                styles.matchText,
                {
                  color: password === confirmPassword ? colors.primary : colors.danger,
                },
              ]}
            >
              {password === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
            </Text>
          )}

          {/* Primary CTA */}
          <AnimatedPrimaryButton
            onPress={handleSetup}
            disabled={loading || !vaultName.trim() || !password || !confirmPassword}
            loading={loading}
            label={
              loading
                ? (progressStep || 'Initializing...')
                : existingVaults.length > 0
                ? `Initialize "${vaultName.trim() || 'Vault'}"`
                : 'Initialize Zero-Knowledge Vault'
            }
            primaryColor={colors.primary}
            onPrimaryColor={colors.onPrimary}
          />

          {loading && (
            <View
              style={[
                styles.inlineProgressContainer,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' },
              ]}
            >
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.inlineProgressText, { color: colors.textMuted }]}>
                {progressStep || 'Encrypting zero-knowledge envelope...'}
              </Text>
            </View>
          )}
        </View>

        {/* ── Footer Link ── */}
        <TouchableOpacity
          style={styles.linkBtn}
          hitSlop={HIT_SLOP}
          onPress={() => {
            triggerLightHaptic();
            onGoToUnlock();
          }}
        >
          <Text style={[styles.linkText, { color: colors.textMuted }]}>
            {existingVaults.length > 0 ? '← Back to Existing Vaults' : 'Already have a vault? Unlock'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
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
  mnemonicScroll: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },

  topBackNav: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    alignSelf: 'flex-start',
    gap: 6,
  },
  topBackNavText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '500',
  },

  header: { alignItems: 'center', marginBottom: spacing.xl },
  badge: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  badgeText: { fontFamily: 'Inter', fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  title: {
    fontFamily: 'Inter',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginBottom: spacing.xs,
    textAlign: 'center',
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

  fieldBlock: {
    width: '100%',
  },
  fieldLabel: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.1,
    marginBottom: 6,
    marginLeft: 2,
  },

  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1.5,
    minHeight: 52,
    overflow: 'hidden',
  },
  inputText: {
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
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 7,
    minHeight: 32,
  },
  generateBtnText: { fontFamily: 'Inter', fontSize: 11, fontWeight: '700' },
  iconBtn: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },

  strengthMeter: { marginTop: 8, marginBottom: 2 },
  strengthTrack: { height: 4, borderRadius: 99, overflow: 'hidden' },
  strengthFill: { height: '100%', borderRadius: 99 },
  strengthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
    paddingHorizontal: 2,
  },
  strengthLabel: { fontFamily: 'Inter', fontSize: 11, fontWeight: '600' },
  strengthScore: { fontFamily: 'monospace', fontSize: 11 },

  matchText: { fontFamily: 'Inter', fontSize: 11, fontWeight: '600', marginTop: 7, paddingHorizontal: 4 },

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

  linkBtn: {
    minHeight: layout.minTouchTarget,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: { fontFamily: 'Inter', fontSize: 14, fontWeight: '600' },

  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xl,
  },
  loadingText: { fontFamily: 'Inter', fontSize: 13, fontWeight: '600' },

  inlineProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  inlineProgressText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.2,
  },

  wordGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  wordBadge: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
  },
  wordIndex: { fontSize: 11, width: 24, fontFamily: 'monospace' },
  wordText: { fontFamily: 'Inter', fontSize: 13, fontWeight: '600' },

  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.minTouchTarget,
    marginBottom: spacing.lg,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    marginRight: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { fontSize: 14, fontWeight: 'bold' },
  checkboxLabel: { fontFamily: 'Inter', fontSize: 13, flex: 1, lineHeight: 19 },
});
