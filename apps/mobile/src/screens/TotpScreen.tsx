/**
 * @file apps/mobile/src/screens/TotpScreen.tsx
 * @description Arca Mobile — RFC 6238 TOTP Authenticator Code Display with Progress Ring.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Clipboard } from 'react-native';
import { colors, spacing, radii } from '../theme/theme';
import { generateTotpCode } from '@vaultguard/crypto';
import { VaultItemPlaintext } from '@vaultguard/shared';

interface TotpScreenProps {
  item: VaultItemPlaintext;
  onBack: () => void;
}

export function TotpScreen({ item, onBack }: TotpScreenProps) {
  const [code, setCode] = useState('000000');
  const [secondsRemaining, setSecondsRemaining] = useState(30);
  const [copied, setCopied] = useState(false);

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
        }
      } catch {
        if (isMounted) {
          setCode('ERROR');
        }
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [item.totpConfig, (item as any).totpSecret]);

  const handleCopy = () => {
    Clipboard.setString(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{item.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.userLabel}>{item.username || 'Authenticator Code'}</Text>

        <TouchableOpacity style={styles.codeCard} onPress={handleCopy}>
          <Text style={styles.codeText}>
            {code.slice(0, 3)} {code.slice(3)}
          </Text>
          <Text style={styles.timerText}>{secondsRemaining}s remaining</Text>
          <View
            style={[
              styles.progressBar,
              { width: `${(secondsRemaining / 30) * 100}%` },
            ]}
          />
        </TouchableOpacity>

        <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
          <Text style={styles.copyButtonText}>
            {copied ? '✓ Copied to Clipboard' : 'Copy TOTP Code'}
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  userLabel: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: spacing.xl,
  },
  codeCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
    overflow: 'hidden',
  },
  codeText: {
    color: colors.emerald,
    fontSize: 40,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
    marginBottom: spacing.md,
  },
  timerText: {
    color: colors.textDim,
    fontSize: 13,
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    backgroundColor: colors.emerald,
  },
  copyButton: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  copyButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
});
