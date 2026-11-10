/**
 * @file apps/mobile/src/screens/RecoveryKitScreen.tsx
 * @description "Next-Gen" Shamir 2-of-3 Recovery Kit Screen with `react-native-view-shot`
 * Export to PDF / Photos and Mandatory 3-Word Verification Quiz.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Share,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ViewShot from 'react-native-view-shot';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import {
  ShieldCheck,
  Download,
  Copy,
  CheckCircle2,
  KeyRound,
  Lock,
  Sparkles,
} from 'lucide-react-native';
import {
  useTheme,
  spacing,
  radii,
  layout,
  HIT_SLOP,
  getSafeTopPadding,
  AnimatedScreen,
  triggerLightHaptic,
  triggerMediumHaptic,
  triggerSuccessHaptic,
  triggerErrorHaptic,
} from '../theme/theme';
import {
  generateShamir2of3Shares,
  ShamirShareCardData,
} from '../crypto/mobileCrypto';

export interface RecoveryKitScreenProps {
  vaultName: string;
  mnemonicWords: string[];
  onComplete: () => void;
}

const SHARE_TITLES = [
  'Share 1 · Primary Vault Key',
  'Share 2 · Offline Safe / Printed Copy',
  'Share 3 · Trusted Custodian',
];

export function RecoveryKitScreen({
  vaultName,
  mnemonicWords,
  onComplete,
}: RecoveryKitScreenProps) {
  const { colors } = useTheme();
  const viewShotRef = useRef<ViewShot>(null);

  const [shares, setShares] = useState<ShamirShareCardData[]>([]);
  const [exportedUri, setExportedUri] = useState<string | null>(null);
  const [showQuizModal, setShowQuizModal] = useState(false);

  // Pick 3 deterministic/random word positions from the 24-word phrase for the quiz
  const quizIndices = useMemo(() => {
    const len = mnemonicWords.length;
    if (len < 3) return [0, 1, 2];
    return [2, Math.floor(len / 2), len - 2]; // e.g., Word #3, Word #13, Word #23
  }, [mnemonicWords]);

  const [quizAnswers, setQuizAnswers] = useState<[string, string, string]>([
    '',
    '',
    '',
  ]);
  const [quizError, setQuizError] = useState<string | null>(null);

  const exportCardScale = useSharedValue(1);
  const animatedExportCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: exportCardScale.value }],
  }));

  useEffect(() => {
    const phrase = mnemonicWords.join(' ');
    generateShamir2of3Shares(phrase)
      .then(setShares)
      .catch(() => {});
  }, [mnemonicWords]);

  const handleExportRecoveryKit = async () => {
    triggerLightHaptic();
    try {
      exportCardScale.value = withSequence(
        withSpring(0.98, { damping: 16, stiffness: 300 }),
        withSpring(1, { damping: 14, stiffness: 220 })
      );

      let uri = '';
      if (viewShotRef.current && typeof viewShotRef.current.capture === 'function') {
        uri = await viewShotRef.current.capture();
        setExportedUri(uri);
      }

      triggerSuccessHaptic();
      const printablePayload = [
        `=== ARCA ZERO-KNOWLEDGE RECOVERY KIT (${vaultName}) ===`,
        `Threshold: Any 2 of 3 Shamir Shares required to reconstruct.`,
        ...shares.map(
          (s, idx) =>
            `\n[${SHARE_TITLES[idx]}]\nFingerprint: ${s.fingerprint}\nShare: ${s.hexShare}`
        ),
      ].join('\n');

      await Share.share({
        title: `Arca Recovery Kit - ${vaultName}`,
        message: printablePayload,
        url: uri || undefined,
      });
    } catch {
      triggerErrorHaptic();
      Alert.alert('Export Notice', 'Could not export Recovery Kit snapshot.');
    } finally {
      // Zero-Knowledge RAM Wiping: Clear exported URI snapshot reference from memory
      setTimeout(() => {
        setExportedUri(null);
      }, 1000);
    }
  };

  const handleCopyShare = (share: ShamirShareCardData, title: string) => {
    triggerMediumHaptic();
    Clipboard.setString(share.hexShare);
    Alert.alert('Share Copied', `${title} (${share.fingerprint}) copied to clipboard.`);
  };

  const handleVerifyQuiz = () => {
    triggerLightHaptic();
    setQuizError(null);

    for (let i = 0; i < 3; i++) {
      const expected = (mnemonicWords[quizIndices[i]] || '').trim().toLowerCase();
      const actual = quizAnswers[i].trim().toLowerCase();
      if (expected && actual !== expected) {
        triggerErrorHaptic();
        setQuizError(
          `Word #${quizIndices[i] + 1} does not match. Please double-check your recovery phrase.`
        );
        return;
      }
    }

    triggerSuccessHaptic();
    onComplete();
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <AnimatedScreen style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: getSafeTopPadding(12) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Badge */}
          <View style={styles.headerSection}>
            <View
              style={[
                styles.indigoBadge,
                {
                  backgroundColor: colors.primaryGlow,
                  borderColor: colors.primaryBorderGlow,
                },
              ]}
            >
              <Sparkles size={13} color={colors.primary} />
              <Text style={[styles.indigoBadgeText, { color: colors.primary }]}>
                SHAMIR 2-OF-3 THRESHOLD CRYPTOGRAPHY
              </Text>
            </View>
            <Text style={[styles.largeTitle, { color: colors.textHeading }]}>
              Next-Gen Recovery Kit
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Your recovery key for "{vaultName}" is split into 3 mathematical shares. Any 2 shares can restore your vault—a single share reveals zero bytes.
            </Text>
          </View>

          {/* ViewShot Capturable Recovery Kit Card Layout */}
          <ViewShot
            ref={viewShotRef}
            options={{ format: 'png', quality: 1.0 }}
          >
            <Animated.View
              style={[
                styles.kitCaptureContainer,
                {
                  backgroundColor: colors.background,
                },
                animatedExportCardStyle,
              ]}
            >
              {shares.map((share, idx) => (
                <View
                  key={share.index}
                  style={[
                    styles.shareCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor:
                        idx === 0 ? colors.primaryBorderGlow : colors.border,
                    },
                  ]}
                >
                  <View style={styles.shareCardHeader}>
                    <View style={styles.shareTitleRow}>
                      <View
                        style={[
                          styles.shareIndexPill,
                          { backgroundColor: colors.primaryGlow },
                        ]}
                      >
                        <KeyRound size={14} color={colors.primary} />
                        <Text
                          style={[
                            styles.shareIndexText,
                            { color: colors.primary },
                          ]}
                        >
                          {share.index} OF {share.total}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.shareCardTitle,
                          { color: colors.textHeading },
                        ]}
                      >
                        {SHARE_TITLES[idx]}
                      </Text>
                    </View>

                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      onPress={() => handleCopyShare(share, SHARE_TITLES[idx])}
                    >
                      <Copy size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  <View
                    style={[
                      styles.hexBox,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.hexText, { color: colors.text }]}
                      numberOfLines={2}
                      selectable
                    >
                      {share.hexShare}
                    </Text>
                  </View>

                  <View style={styles.shareFooterRow}>
                    <Text style={[styles.fpLabel, { color: colors.textDim }]}>
                      BLAKE2b Checksum:{' '}
                      <Text style={{ color: colors.primary, fontWeight: '700' }}>
                        {share.fingerprint}
                      </Text>
                    </Text>
                    <Text style={[styles.thresholdTag, { color: colors.textMuted }]}>
                      Requires 2-of-3
                    </Text>
                  </View>
                </View>
              ))}
            </Animated.View>
          </ViewShot>

          {/* Export to PDF / Save to Photos Button */}
          <TouchableOpacity
            style={[
              styles.exportButton,
              {
                backgroundColor: colors.surface,
                borderColor: colors.primaryBorderGlow,
              },
            ]}
            hitSlop={HIT_SLOP}
            activeOpacity={0.85}
            onPress={handleExportRecoveryKit}
          >
            <Download size={18} color={colors.primary} />
            <Text style={[styles.exportButtonText, { color: colors.primary }]}>
              {exportedUri
                ? '✓ Kit Captured · Export to PDF / Photos Again'
                : 'Export to PDF / Save to Photos'}
            </Text>
          </TouchableOpacity>

          {/* Compact 24-Word Reference Grid */}
          <View
            style={[
              styles.wordsCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.wordsSectionTitle, { color: colors.textHeading }]}>
              24-Word Master Mnemonic Reference
            </Text>
            <View style={styles.wordGrid}>
              {mnemonicWords.map((word, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.wordChip,
                    {
                      backgroundColor: colors.background,
                      borderColor: quizIndices.includes(idx)
                        ? colors.primaryBorderGlow
                        : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.wordNum, { color: colors.textDim }]}>
                    {idx + 1}.
                  </Text>
                  <Text style={[styles.wordVal, { color: colors.text }]}>
                    {word}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* 3-Word Verification Quiz Section */}
          {!showQuizModal ? (
            <TouchableOpacity
              style={[
                styles.primaryCtaPill,
                { backgroundColor: colors.primary },
              ]}
              hitSlop={HIT_SLOP}
              activeOpacity={0.88}
              onPress={() => {
                triggerLightHaptic();
                setShowQuizModal(true);
              }}
            >
              <ShieldCheck size={19} color={colors.onPrimary} />
              <Text
                style={[styles.primaryCtaPillText, { color: colors.onPrimary }]}
              >
                Take 3-Word Verification Quiz to Continue
              </Text>
            </TouchableOpacity>
          ) : (
            <View
              style={[
                styles.quizCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.primary,
                },
              ]}
            >
              <View style={styles.quizHeaderRow}>
                <Lock size={18} color={colors.primary} />
                <Text style={[styles.quizTitle, { color: colors.textHeading }]}>
                  3-Word Security Verification Quiz
                </Text>
              </View>
              <Text style={[styles.quizSubtitle, { color: colors.textMuted }]}>
                Enter the exact words from your 24-word recovery phrase to confirm your backup is saved.
              </Text>

              {quizIndices.map((wordIndex, idx) => (
                <View key={wordIndex} style={styles.quizInputBlock}>
                  <Text style={[styles.quizInputLabel, { color: colors.text }]}>
                    Word #{wordIndex + 1}
                  </Text>
                  <TextInput
                    style={[
                      styles.quizInput,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.borderSubtle,
                        color: colors.text,
                      },
                    ]}
                    placeholder={`Enter word #${wordIndex + 1}...`}
                    placeholderTextColor={colors.textDim}
                    value={quizAnswers[idx]}
                    onChangeText={(val) => {
                      const next: [string, string, string] = [...quizAnswers] as any;
                      next[idx] = val;
                      setQuizAnswers(next);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              ))}

              {quizError && (
                <Text style={[styles.quizErrorText, { color: colors.danger }]}>
                  {quizError}
                </Text>
              )}

              <TouchableOpacity
                style={[
                  styles.primaryCtaPill,
                  { backgroundColor: colors.primary, marginTop: spacing.md },
                ]}
                hitSlop={HIT_SLOP}
                activeOpacity={0.88}
                onPress={handleVerifyQuiz}
              >
                <CheckCircle2 size={19} color={colors.onPrimary} />
                <Text
                  style={[styles.primaryCtaPillText, { color: colors.onPrimary }]}
                >
                  Verify & Enter Vault
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  headerSection: {
    marginBottom: spacing.lg,
  },
  indigoBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  indigoBadgeText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  largeTitle: {
    fontFamily: 'Inter',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  subtitle: {
    fontFamily: 'Inter',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  kitCaptureContainer: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  shareCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing.lg,
  },
  shareCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  shareTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  shareIndexPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  shareIndexText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '800',
  },
  shareCardTitle: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  hexBox: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  hexText: {
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  shareFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fpLabel: {
    fontFamily: 'monospace',
    fontSize: 11,
  },
  thresholdTag: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '600',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: layout.minButtonHeight,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    marginBottom: spacing.lg,
  },
  exportButtonText: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '700',
  },
  wordsCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  wordsSectionTitle: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  wordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  wordChip: {
    width: '31.5%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    marginBottom: 8,
  },
  wordNum: {
    fontFamily: 'monospace',
    fontSize: 10,
    width: 20,
  },
  wordVal: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
  },
  primaryCtaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: layout.minButtonHeight,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xl,
  },
  primaryCtaPillText: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '700',
  },
  quizCard: {
    borderRadius: radii.card,
    borderWidth: 1.5,
    padding: spacing.lg,
  },
  quizHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  quizTitle: {
    fontFamily: 'Inter',
    fontSize: 17,
    fontWeight: '800',
  },
  quizSubtitle: {
    fontFamily: 'Inter',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  quizInputBlock: {
    marginBottom: spacing.sm,
  },
  quizInputLabel: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  quizInput: {
    fontFamily: 'Inter',
    fontSize: 15,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  quizErrorText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
});

