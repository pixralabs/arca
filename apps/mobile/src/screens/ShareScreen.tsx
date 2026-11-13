/**
 * @file apps/mobile/src/screens/ShareScreen.tsx
 * @description Arca Mobile — Ephemeral One-Time Secure Share Creation Screen
 * with Monochrome + Electric Indigo Aesthetic, Pill Buttons (minHeight 52), 24px Curvy Cards,
 * Soft Focus-Glow Inputs, Keyboard Awareness, Shimmering Skeleton State, and Tactile Haptics.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Clipboard,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from '../components/SafeAreaView';
import {
  useTheme,
  spacing,
  radii,
  layout,
  HIT_SLOP,
  AnimatedScreen,
  ShimmerSkeleton,
  triggerLightHaptic,
  triggerSuccessHaptic,
} from '../theme/theme';
import { createEphemeralShare } from '@vaultguard/crypto';

interface ShareScreenProps {
  onBack: () => void;
}

export function ShareScreen({ onBack }: ShareScreenProps) {
  const { colors, isDark } = useTheme();
  const [secretText, setSecretText] = useState('');
  const [expiryHours] = useState('24');
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const handleCreateShare = async () => {
    triggerLightHaptic();
    if (!secretText.trim()) {
      Alert.alert('Required', 'Please enter text or secret to share.');
      return;
    }

    setLoading(true);
    try {
      const res = await createEphemeralShare({
        payload: { text: secretText },
        maxViews: 1,
        expiresInSeconds: parseInt(expiryHours, 10) * 3600 || 86400,
        relayServerUrl: 'https://arca-rc8v.onrender.com',
      });
      triggerSuccessHaptic();
      setShareUrl(res.url);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create ephemeral share.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    triggerLightHaptic();
    if (shareUrl) {
      Clipboard.setString(shareUrl);
      Alert.alert('Copied', 'One-time secure link copied to clipboard.');
    }
  };

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
            One-Time Share
          </Text>
          <View style={{ width: layout.minTouchTarget }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.skeletonCard}>
              <ShimmerSkeleton
                width="60%"
                height={24}
                borderRadius={radii.md}
                style={{ marginBottom: spacing.md }}
              />
              <ShimmerSkeleton
                width="100%"
                height={120}
                borderRadius={radii.card}
                style={{ marginBottom: spacing.lg }}
              />
              <ShimmerSkeleton
                width="100%"
                height={layout.minButtonHeight}
                borderRadius={radii.pill}
              />
            </View>
          ) : shareUrl ? (
            <View
              style={[
                styles.resultCard,
                { backgroundColor: colors.surface },
              ]}
            >
              <Text style={[styles.successTitle, { color: colors.textHeading }]}>
                Ephemeral Link Created
              </Text>
              <Text style={[styles.successSubtitle, { color: colors.textMuted }]}>
                This link self-destructs after 1 view or when the expiration window closes.
              </Text>
              <TouchableOpacity
                style={[
                  styles.urlBox,
                  { backgroundColor: colors.surfaceSubtle },
                ]}
                onPress={handleCopy}
                activeOpacity={0.8}
              >
                <Text
                  style={[styles.urlText, { color: colors.primary }]}
                  numberOfLines={3}
                >
                  {shareUrl}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleCopy}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.primaryButtonText,
                    { color: colors.onPrimary },
                  ]}
                >
                  Copy Secure Link
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View
              style={[
                styles.formCard,
                { backgroundColor: colors.surface },
              ]}
            >
              <Text style={[styles.label, { color: colors.textMuted }]}>
                Secret Message or Password
              </Text>
              <TextInput
                collapsable={false}
                style={[
                  styles.input,
                  styles.multilineInput,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    color: colors.text,
                    borderColor: focused ? colors.primary : (isDark ? '#27272a' : colors.border),
                  },
                ]}
                placeholder="Paste password or secret here..."
                placeholderTextColor={colors.textDim}
                value={secretText}
                onChangeText={setSecretText}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                multiline
              />

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleCreateShare}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.primaryButtonText,
                    { color: colors.onPrimary },
                  ]}
                >
                  Generate One-Time Link
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  skeletonCard: {
    width: '100%',
  },
  formCard: {
    borderRadius: radii.card, // 24px curvy card
    padding: spacing.lg,
  },
  label: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  input: {
    fontFamily: 'Inter',
    borderWidth: 1.5,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    marginBottom: spacing.xl,
  },
  multilineInput: {
    minHeight: 132,
    textAlignVertical: 'top',
  },
  primaryButton: {
    width: '100%',
    borderRadius: radii.pill, // 9999 pill-shaped
    minHeight: layout.minButtonHeight, // >= 52px
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  resultCard: {
    borderRadius: radii.card, // 24px curvy card
    padding: spacing.xl,
    alignItems: 'center',
  },
  successTitle: {
    fontFamily: 'Inter',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: spacing.xs,
  },
  successSubtitle: {
    fontFamily: 'Inter',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  urlBox: {
    width: '100%',
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  urlText: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
});