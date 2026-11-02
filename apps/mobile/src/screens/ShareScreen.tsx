/**
 * @file apps/mobile/src/screens/ShareScreen.tsx
 * @description Arca Mobile — Ephemeral One-Time Secure Share Creation Screen.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Clipboard,
} from 'react-native';
import { colors, spacing, radii } from '../theme/theme';
import { createEphemeralShare } from '@vaultguard/crypto';

interface ShareScreenProps {
  onBack: () => void;
}

export function ShareScreen({ onBack }: ShareScreenProps) {
  const [secretText, setSecretText] = useState('');
  const [expiryHours, setExpiryHours] = useState('24');
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const handleCreateShare = async () => {
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
      setShareUrl(res.url);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create ephemeral share.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (shareUrl) {
      Clipboard.setString(shareUrl);
      Alert.alert('Copied', 'One-time secure link copied to clipboard.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>One-Time Share</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        {shareUrl ? (
          <View style={styles.resultContainer}>
            <Text style={styles.successTitle}>Ephemeral Link Created!</Text>
            <Text style={styles.successSubtitle}>
              This link self-destructs after 1 view or when the expiration window closes.
            </Text>
            <TouchableOpacity style={styles.urlCard} onPress={handleCopy}>
              <Text style={styles.urlText} numberOfLines={3}>
                {shareUrl}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={handleCopy}>
              <Text style={styles.primaryButtonText}>Copy Secure Link</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={styles.label}>Secret Message or Password</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Paste password or secret here..."
              placeholderTextColor={colors.textDim}
              value={secretText}
              onChangeText={setSecretText}
              multiline
            />

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleCreateShare}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.primaryButtonText}>Generate One-Time Link</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.xs,
  },
  backButtonText: {
    color: colors.emerald,
    fontSize: 16,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 16,
    marginBottom: spacing.xl,
  },
  multilineInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  primaryButton: {
    backgroundColor: colors.emerald,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  resultContainer: {
    alignItems: 'center',
  },
  successTitle: {
    color: colors.emerald,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  successSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  urlCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  urlText: {
    color: colors.textDim,
    fontSize: 13,
  },
});
