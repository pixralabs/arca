/**
 * @file apps/mobile/src/screens/GeneratorScreen.tsx
 * @description Arca Mobile — Cryptographically Strong Password and Passphrase Generator.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Clipboard } from 'react-native';
import { colors, spacing, radii } from '../theme/theme';
import { generatePassword, generatePassphrase } from '../crypto/mobileCrypto';

interface GeneratorScreenProps {
  onBack: () => void;
}

export function GeneratorScreen({ onBack }: GeneratorScreenProps) {
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [isPassphrase, setIsPassphrase] = useState(false);

  const generate = useCallback(async (passphraseMode: boolean) => {
    try {
      if (passphraseMode) {
        const val = await generatePassphrase(5);
        setPassword(val);
      } else {
        const val = await generatePassword({ length: 20 });
        setPassword(val);
      }
    } catch {
      // fallback
    }
  }, []);

  useEffect(() => {
    generate(false);
  }, [generate]);

  const handleGenerate = () => {
    generate(isPassphrase);
  };

  const handleCopy = () => {
    if (password) {
      Clipboard.setString(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Password Generator</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <TouchableOpacity style={styles.resultCard} onPress={handleCopy}>
          <Text style={styles.resultText} selectable>
            {password || 'Generating...'}
          </Text>
        </TouchableOpacity>

        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, !isPassphrase && styles.toggleBtnActive]}
            onPress={() => {
              setIsPassphrase(false);
              generate(false);
            }}
          >
            <Text style={[styles.toggleText, !isPassphrase && styles.toggleTextActive]}>
              Password
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, isPassphrase && styles.toggleBtnActive]}
            onPress={() => {
              setIsPassphrase(true);
              generate(true);
            }}
          >
            <Text style={[styles.toggleText, isPassphrase && styles.toggleTextActive]}>
              Passphrase
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleGenerate}>
          <Text style={styles.primaryButtonText}>Regenerate</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleCopy}>
          <Text style={styles.secondaryButtonText}>
            {copied ? '✓ Copied to Clipboard' : 'Copy Password'}
          </Text>
        </TouchableOpacity>
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
  resultCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  resultText: {
    color: colors.emerald,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
    overflow: 'hidden',
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: colors.emeraldSubtle,
  },
  toggleText: {
    color: colors.textDim,
    fontSize: 14,
    fontWeight: '500',
  },
  toggleTextActive: {
    color: colors.emerald,
    fontWeight: '600',
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
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
});
