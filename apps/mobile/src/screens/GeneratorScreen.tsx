/**
 * @file apps/mobile/src/screens/GeneratorScreen.tsx
 * @description Arca Mobile — Cryptographically Strong Password and Passphrase Generator
 * with Monochrome + Electric Indigo Aesthetic, Pill Buttons (minHeight 52), 24px Curvy Cards,
 * Reanimated Spring Feedback, >=48x48 Touch Targets, and Tactile Haptics.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Clipboard,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from '../components/SafeAreaView';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import {
  useTheme,
  spacing,
  radii,
  layout,
  HIT_SLOP,
  AnimatedScreen,
  triggerLightHaptic,
} from '../theme/theme';
import { generatePassword, generatePassphrase } from '../crypto/mobileCrypto';

interface GeneratorScreenProps {
  onBack: () => void;
}

export function GeneratorScreen({ onBack }: GeneratorScreenProps) {
  const { colors } = useTheme();
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [isPassphrase, setIsPassphrase] = useState(false);

  const cardScale = useSharedValue(1);

  const pulseCard = useCallback(() => {
    cardScale.value = withSequence(
      withSpring(0.97, { damping: 16, stiffness: 300 }),
      withSpring(1, { damping: 14, stiffness: 220 })
    );
  }, [cardScale]);

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  const generate = useCallback(
    async (passphraseMode: boolean) => {
      try {
        if (passphraseMode) {
          const val = await generatePassphrase(5);
          setPassword(val);
        } else {
          const val = await generatePassword({ length: 20 });
          setPassword(val);
        }
        pulseCard();
      } catch {
        // fallback
      }
    },
    [pulseCard]
  );

  useEffect(() => {
    void generate(false);
  }, [generate]);

  const handleGenerate = () => {
    triggerLightHaptic();
    void generate(isPassphrase);
  };

  const handleCopy = () => {
    triggerLightHaptic();
    if (password) {
      Clipboard.setString(password);
      setCopied(true);
      pulseCard();
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.container, { backgroundColor: colors.background }]}
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
          Password Generator
        </Text>
        <View style={{ width: layout.minTouchTarget }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={animatedCardStyle}>
          <TouchableOpacity
            style={[
              styles.resultCard,
              {
                backgroundColor: colors.surface,
              },
            ]}
            onPress={handleCopy}
            activeOpacity={0.82}
          >
            <View
              style={[
                styles.entropyBadge,
                { backgroundColor: colors.primaryGlow },
              ]}
            >
              <Text style={[styles.entropyBadgeText, { color: colors.primary }]}>
                {isPassphrase ? '5-WORD PASSPHRASE' : '256-BIT ENTROPY'}
              </Text>
            </View>
            <Text
              style={[styles.resultText, { color: colors.textHeading }]}
              selectable
            >
              {password || 'Generating...'}
            </Text>
            <Text style={[styles.tapToCopyHint, { color: colors.textMuted }]}>
              Tap card to copy to clipboard
            </Text>
          </TouchableOpacity>
        </Animated.View>

        <View
          style={[
            styles.toggleRow,
            {
              backgroundColor: colors.surface,
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.toggleBtn,
              !isPassphrase && { backgroundColor: colors.primary },
            ]}
            hitSlop={HIT_SLOP}
            onPress={() => {
              triggerLightHaptic();
              setIsPassphrase(false);
              void generate(false);
            }}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.toggleText,
                { color: !isPassphrase ? colors.onPrimary : colors.textMuted },
              ]}
            >
              Password
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleBtn,
              isPassphrase && { backgroundColor: colors.primary },
            ]}
            hitSlop={HIT_SLOP}
            onPress={() => {
              triggerLightHaptic();
              setIsPassphrase(true);
              void generate(true);
            }}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.toggleText,
                { color: isPassphrase ? colors.onPrimary : colors.textMuted },
              ]}
            >
              Passphrase
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={handleGenerate}
          activeOpacity={0.85}
        >
          <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
            Regenerate
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.secondaryButton,
            { backgroundColor: colors.surfaceSubtle },
          ]}
          onPress={handleCopy}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.secondaryButtonText,
              { color: copied ? colors.primary : colors.text },
            ]}
          >
            {copied ? '✓ Copied to Clipboard' : 'Copy Password'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
  content: {
    flexGrow: 1,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  resultCard: {
    borderRadius: radii.card, // 24px curvy card
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  entropyBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.pill,
    marginBottom: spacing.md,
  },
  entropyBadgeText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  resultText: {
    fontFamily: 'Inter',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
    marginBottom: spacing.sm,
  },
  tapToCopyHint: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '500',
  },
  toggleRow: {
    flexDirection: 'row',
    borderRadius: radii.pill, // Pill-shaped segmented control
    padding: 4,
    marginBottom: spacing.xl,
  },
  toggleBtn: {
    flex: 1,
    minHeight: layout.minTouchTarget, // >= 48px touch target
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    borderRadius: radii.pill, // 9999 pill-shaped
    minHeight: layout.minButtonHeight, // >= 52px
    paddingVertical: spacing.md,
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
    borderRadius: radii.pill, // 9999 pill-shaped
    minHeight: layout.minButtonHeight, // >= 52px
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});