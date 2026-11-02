/**
 * @file apps/mobile/src/screens/SetupScreen.tsx
 * @description Arca Mobile — Zero-Knowledge Vault Creation and BIP-39 Recovery Phrase display.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { colors, spacing, radii } from '../theme/theme';
import { mobileSetupVault } from '../crypto/mobileCrypto';

interface SetupScreenProps {
  onVaultCreated: () => void;
  onGoToUnlock: () => void;
}

export function SetupScreen({ onVaultCreated, onGoToUnlock }: SetupScreenProps) {
  const [password, setPassword] = useState(__DEV__ ? 'MasterPassword123' : '');
  const [confirmPassword, setConfirmPassword] = useState(__DEV__ ? 'MasterPassword123' : '');
  const [loading, setLoading] = useState(false);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [confirmedBackup, setConfirmedBackup] = useState(false);

  const handleCreateVault = async () => {
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
      setMnemonic(res.mnemonic);
    } catch (err: any) {
      Alert.alert('Creation Failed', err?.message || 'Failed to initialize vault.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    if (!confirmedBackup) {
      Alert.alert('Confirmation Required', 'Please confirm that you have saved your recovery phrase.');
      return;
    }
    onVaultCreated();
  };

  if (mnemonic) {
    const words = mnemonic.split(' ');
    return (
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Emergency Recovery Kit</Text>
          <Text style={styles.subtitle}>
            Write down these 24 words in exact order. Store them in a secure physical location.
            Pixra does not keep a copy and cannot recover your vault without them.
          </Text>
        </View>

        <View style={styles.grid}>
          {words.map((word, idx) => (
            <View key={idx} style={styles.wordBadge}>
              <Text style={styles.wordIndex}>{idx + 1}.</Text>
              <Text style={styles.wordText}>{word}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.checkboxContainer}
          onPress={() => setConfirmedBackup(!confirmedBackup)}
        >
          <View style={[styles.checkbox, confirmedBackup && styles.checkboxActive]}>
            {confirmedBackup && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkboxLabel}>
            I have securely written down and stored my 24 recovery words.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryButton, !confirmedBackup && styles.buttonDisabled]}
          onPress={handleFinish}
          disabled={!confirmedBackup}
        >
          <Text style={styles.primaryButtonText}>Enter My Vault</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Zero-Knowledge Setup</Text>
        </View>
        <Text style={styles.title}>Create Master Password</Text>
        <Text style={styles.subtitle}>
          This password encrypts your vault with Argon2id and XChaCha20-Poly1305.
          Choose a strong, unique passphrase.
        </Text>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="New Master Password (min 12 chars)"
          placeholderTextColor={colors.textDim}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="Confirm Master Password"
          placeholderTextColor={colors.textDim}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleCreateVault}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.primaryButtonText}>Initialize Zero-Knowledge Vault</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={onGoToUnlock}>
          <Text style={styles.linkButtonText}>Already have a vault? Unlock</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footerContainer}>
        <Image
          source={require('../assets/footer_pixra_white.png')}
          style={styles.footerImage}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'space-between',
    padding: spacing.xl,
  },
  scrollContainer: {
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  badge: {
    backgroundColor: colors.emeraldSubtle,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
  },
  badgeText: {
    color: colors.emerald,
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    lineHeight: 20,
  },
  form: {
    width: '100%',
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
    marginBottom: spacing.md,
  },
  primaryButton: {
    backgroundColor: colors.emerald,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  linkButton: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  linkButtonText: {
    color: colors.emerald,
    fontSize: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  wordBadge: {
    width: '48%',
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  wordIndex: {
    color: colors.textDim,
    fontSize: 12,
    width: 24,
  },
  wordText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.sm,
    marginRight: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
  },
  checkmark: {
    color: colors.background,
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    color: colors.textMuted,
    fontSize: 13,
    flex: 1,
  },
  footerContainer: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
  footerImage: {
    width: 140,
    height: 38,
    opacity: 0.75,
  },
});
