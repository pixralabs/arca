/**
 * @file apps/mobile/src/screens/UnlockScreen.tsx
 * @description Arca Mobile — Unlock View with Master Password and Biometrics.
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
} from 'react-native';
import { colors, spacing, radii } from '../theme/theme';
import { mobileUnlockVault, mobileUnlockWithRecovery } from '../crypto/mobileCrypto';
import { retrieveBiometricSlotKey } from '../crypto/keychain';

interface UnlockScreenProps {
  onUnlocked: () => void;
  onGoToSetup: () => void;
}

export function UnlockScreen({ onUnlocked, onGoToSetup }: UnlockScreenProps) {
  const [password, setPassword] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleUnlock = async () => {
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
      onUnlocked();
    } catch (err: any) {
      Alert.alert('Unlock Failed', err?.message || 'Invalid Master Password.');
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricUnlock = async () => {
    try {
      const storedKey = await retrieveBiometricSlotKey();
      if (storedKey) {
        await mobileUnlockVault(storedKey);
        onUnlocked();
      } else {
        Alert.alert('Biometrics', 'Biometric credential not available.');
      }
    } catch (err: any) {
      Alert.alert('Biometric Error', err?.message || 'Biometric authentication failed.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Arca by Pixra</Text>
        </View>
        <Text style={styles.title}>
          {isRecoveryMode ? 'Account Recovery' : 'Unlock Vault'}
        </Text>
        <Text style={styles.subtitle}>
          {isRecoveryMode
            ? 'Enter your 24-word recovery phrase to restore access.'
            : 'Enter your Master Password to decrypt your zero-knowledge vault.'}
        </Text>
      </View>

      <View style={styles.form}>
        {isRecoveryMode ? (
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="Enter 24-word recovery phrase..."
            placeholderTextColor={colors.textDim}
            value={recoveryPhrase}
            onChangeText={setRecoveryPhrase}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
        ) : (
          <TextInput
            style={styles.input}
            placeholder="Master Password"
            placeholderTextColor={colors.textDim}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />
        )}

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleUnlock}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {isRecoveryMode ? 'Restore Vault' : 'Unlock Vault'}
            </Text>
          )}
        </TouchableOpacity>

        {!isRecoveryMode && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleBiometricUnlock}
          >
            <Text style={styles.secondaryButtonText}>Use Biometrics</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => setIsRecoveryMode(!isRecoveryMode)}
        >
          <Text style={styles.linkButtonText}>
            {isRecoveryMode ? 'Back to Master Password' : 'Lost Master Password? Use Recovery Phrase'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={onGoToSetup}>
          <Text style={styles.dimLinkText}>Create New Vault</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: spacing.xl,
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
    letterSpacing: 0.5,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
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
  multilineInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  primaryButton: {
    backgroundColor: colors.emerald,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  linkButton: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  linkButtonText: {
    color: colors.emerald,
    fontSize: 14,
  },
  dimLinkText: {
    color: colors.textDim,
    fontSize: 13,
  },
});
