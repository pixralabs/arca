/**
 * @file apps/mobile/src/screens/TotpScreen.tsx
 * @description Arca Mobile — RFC 6238 TOTP Authenticator Code Display with Reanimated Progress Bar,
 * Monochrome + Electric Indigo Palette, 24px Curvy Cards, Pill Buttons (minHeight 52), and Haptics.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Clipboard } from 'react-native';
import { SafeAreaView } from '../components/SafeAreaView';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
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
import { generateTotpCode } from '@vaultguard/crypto';
import { VaultItemPlaintext } from '@vaultguard/shared';

interface TotpScreenProps {
  item: VaultItemPlaintext;
  onBack: () => void;
}

export function TotpScreen({ item, onBack }: TotpScreenProps) {
  const { colors } = useTheme();
  const [code, setCode] = useState('000000');
  const [secondsRemaining, setSecondsRemaining] = useState(30);
  const [copied, setCopied] = useState(false);

  const progressWidth = useSharedValue(100);

  useEffect(() => {
    const totpSource = item.totpConfig || (item as any).totpSecret;
    if (!totpSource) return;

    let isMounted = true;
    const update = async () => {
      try {
        const res = await generateTotpCode(totpSource);
        if (isMounted) {
          setCode(res.code);
          setSecondsRemaining(res.remainingSeconds);
          progressWidth.value = withTiming((res.remainingSeconds / 30) * 100, {
            duration: 300,
          });
        }
      } catch {
        if (isMounted) {
          setCode('ERROR');
        }
      }
    };

    void update();
    const interval = setInterval(() => void update(), 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [item.totpConfig, (item as any).totpSecret, progressWidth]);

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const handleCopy = () => {
    triggerLightHaptic();
    Clipboard.setString(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          {item.title}
        </Text>
        <View style={{ width: layout.minTouchTarget }} />
      </View>

      <View style={styles.content}>
        <Text style={[styles.userLabel, { color: colors.textMuted }]}>
          {item.username || 'Authenticator Code'}
        </Text>

        <TouchableOpacity
          style={[
            styles.codeCard,
            {
              backgroundColor: colors.surface,
            },
          ]}
          onPress={handleCopy}
          activeOpacity={0.85}
        >
          <View
            style={[
              styles.badgePill,
              { backgroundColor: colors.primaryGlow },
            ]}
          >
            <Text style={[styles.badgePillText, { color: colors.primary }]}>
              RFC 6238 TOTP
            </Text>
          </View>
          <Text style={[styles.codeText, { color: colors.primary }]}>
            {code.slice(0, 3)} {code.slice(3)}
          </Text>
          <Text
            style={[
              styles.timerText,
              {
                color:
                  secondsRemaining <= 5 ? colors.danger : colors.textMuted,
              },
            ]}
          >
            {secondsRemaining}s remaining
          </Text>
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: colors.surfaceSubtle },
            ]}
          >
            <Animated.View
              style={[
                styles.progressBar,
                {
                  backgroundColor:
                    secondsRemaining <= 5 ? colors.danger : colors.primary,
                },
                progressAnimatedStyle,
              ]}
            />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.copyButton,
            {
              backgroundColor: copied ? colors.primaryGlow : colors.primary,
            },
          ]}
          onPress={handleCopy}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.copyButtonText,
              {
                color: copied ? colors.primary : colors.onPrimary,
              },
            ]}
          >
            {copied ? '✓ Copied to Clipboard' : 'Copy TOTP Code'}
          </Text>
        </TouchableOpacity>
      </View>
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  userLabel: {
    fontFamily: 'Inter',
    fontSize: 14,
    marginBottom: spacing.xl,
  },
  codeCard: {
    width: '100%',
    borderRadius: radii.card, // 24px curvy card
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
    overflow: 'hidden',
  },
  badgePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.pill,
    marginBottom: spacing.md,
  },
  badgePillText: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  codeText: {
    fontFamily: 'Inter',
    fontSize: 42,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: 3,
    marginBottom: spacing.sm,
  },
  timerText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.lg,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: radii.pill,
  },
  copyButton: {
    width: '100%',
    borderRadius: radii.pill, // 9999 pill-shaped
    minHeight: layout.minButtonHeight, // >= 52px
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});