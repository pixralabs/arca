/**
 * @file apps/mobile/src/screens/ItemEditorScreen.tsx
 * @description Credential & TOTP 2FA Item Editor with Camera-Based QR Code Scanner.
 * Parses `otpauth://totp/...` URIs automatically and triggers tactile haptic feedback.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { QrCode, ShieldCheck, CheckCircle2 } from 'lucide-react-native';
import {
  useTheme,
  spacing,
  radii,
  layout,
  HIT_SLOP,
  DraggableBottomSheet,
  triggerLightHaptic,
  triggerMediumHaptic,
  triggerSuccessHaptic,
  triggerErrorHaptic,
} from '../theme/theme';
import {
  mobileSaveItem,
  parseOtpAuthUriMobile,
  ParsedOtpAuthResult,
} from '../crypto/mobileCrypto';
import {
  checkPasswordForSavePrompt,
  generatePassword,
} from '@vaultguard/crypto';
import type { MobileVaultItem } from './VaultListScreen';
import { QrScannerModal } from '../components/QrScannerModal';

declare const __DEV__: boolean;

export interface ItemEditorScreenProps {
  visible: boolean;
  existingItems: MobileVaultItem[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

export function ItemEditorScreen({
  visible,
  existingItems,
  onClose,
  onSaved,
}: ItemEditorScreenProps) {
  const { colors } = useTheme();

  const [title, setTitle] = useState(__DEV__ ? 'GitHub' : '');
  const [username, setUsername] = useState(__DEV__ ? 'octocat@github.com' : '');
  const [password, setPassword] = useState(__DEV__ ? 'Secret123!' : '');
  const [totpSecret, setTotpSecret] = useState('');
  const [parsedTotpMeta, setParsedTotpMeta] = useState<ParsedOtpAuthResult | null>(null);
  const [focusedField, setFocusedField] = useState<
    'title' | 'username' | 'password' | 'totp' | null
  >(null);
  const [showQrScanner, setShowQrScanner] = useState(false);

  const handleOtpQrScanned = (scannedUri: string) => {
    setShowQrScanner(false);
    try {
      const parsed = parseOtpAuthUriMobile(scannedUri);
      setParsedTotpMeta(parsed);
      setTotpSecret(parsed.secret);
      if (!title.trim() && parsed.issuer) {
        setTitle(parsed.issuer);
      }
      if (!username.trim() && parsed.accountName) {
        setUsername(parsed.accountName);
      }
      triggerSuccessHaptic();
    } catch (err: any) {
      triggerErrorHaptic();
      Alert.alert(
        'Invalid TOTP QR Code',
        err?.message || 'Could not parse otpauth://totp/ URI.'
      );
    }
  };

  const executeSave = async (passwordToSave: string) => {
    try {
      const cleanTotp = totpSecret.trim();
      let totpConfig = undefined;

      if (cleanTotp) {
        if (cleanTotp.toLowerCase().startsWith('otpauth://')) {
          const p = parseOtpAuthUriMobile(cleanTotp);
          totpConfig = {
            secret: p.secret,
            period: (p.period === 60 ? 60 : 30) as 30 | 60,
            digits: (p.digits === 8 ? 8 : 6) as 6 | 8,
            algorithm: p.algorithm,
            issuer: p.issuer,
          };
        } else {
          totpConfig = {
            secret: cleanTotp.replace(/\s+/g, '').toUpperCase(),
            period: (parsedTotpMeta?.period === 60 ? 60 : 30) as 30 | 60,
            digits: (parsedTotpMeta?.digits === 8 ? 8 : 6) as 6 | 8,
            algorithm: (parsedTotpMeta?.algorithm || 'SHA1') as 'SHA1' | 'SHA256' | 'SHA512',
            issuer: parsedTotpMeta?.issuer || title.trim(),
          };
        }
      }

      const created: MobileVaultItem = {
        id:
          'item_' +
          Date.now().toString(36) +
          '_' +
          Math.random().toString(36).slice(2, 6),
        title: title.trim(),
        username: username.trim(),
        password: passwordToSave,
        urls: [],
        notes: '',
        totpSecret: totpConfig ? totpConfig.secret : null,
        totpConfig,
        type: totpConfig ? 'totp' : 'login',
        customFields: [],
        updatedAt: Date.now(),
        deletedAt: null,
      };

      await mobileSaveItem(created);
      triggerMediumHaptic();
      setTitle('');
      setUsername('');
      setPassword('');
      setTotpSecret('');
      setParsedTotpMeta(null);
      onClose();
      await onSaved();
    } catch {
      triggerErrorHaptic();
      Alert.alert('Error', 'Failed to encrypt and save credential.');
    }
  };

  const handleSavePress = async () => {
    triggerLightHaptic();
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter a website or service name.');
      return;
    }

    if (password.trim()) {
      const auditCheck = checkPasswordForSavePrompt(
        password,
        '',
        existingItems
      );
      if (auditCheck.warningMessage) {
        Alert.alert(
          'Save this existing password to Arca?',
          auditCheck.warningMessage,
          [
            {
              text: 'Save Anyway',
              onPress: () => void executeSave(password),
            },
            {
              text: 'Replace with Arca Generator',
              onPress: async () => {
                const strong = await generatePassword({ length: 20 });
                setPassword(strong);
                await executeSave(strong);
              },
            },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
        return;
      }
    }

    await executeSave(password);
  };

  return (
    <>
      <DraggableBottomSheet visible={visible} onClose={onClose}>
        <View
          style={[
            styles.sheetHeaderRow,
            { borderBottomColor: colors.border },
          ]}
        >
          <TouchableOpacity
            style={styles.sheetHeaderAction}
            hitSlop={HIT_SLOP}
            onPress={() => {
              triggerLightHaptic();
              onClose();
            }}
          >
            <Text style={[styles.sheetCancelText, { color: colors.textMuted }]}>
              Cancel
            </Text>
          </TouchableOpacity>
          <Text style={[styles.sheetHeaderTitle, { color: colors.textHeading }]}>
            New Credential & 2FA
          </Text>
          <TouchableOpacity
            style={styles.sheetHeaderAction}
            hitSlop={HIT_SLOP}
            onPress={handleSavePress}
          >
            <Text style={[styles.sheetSaveText, { color: colors.primary }]}>
              Save
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.sheetScrollForm}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Prominent Camera TOTP QR Scanner CTA */}
          <TouchableOpacity
            style={[
              styles.scanQrBannerBtn,
              {
                backgroundColor: colors.primaryGlow,
                borderColor: colors.primaryBorderGlow,
              },
            ]}
            hitSlop={HIT_SLOP}
            activeOpacity={0.82}
            onPress={() => {
              triggerLightHaptic();
              setShowQrScanner(true);
            }}
          >
            <View
              style={[
                styles.scanQrIconCircle,
                { backgroundColor: colors.primary },
              ]}
            >
              <QrCode size={20} color={colors.onPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.scanQrTitle, { color: colors.textHeading }]}>
                Scan 2FA QR Code
              </Text>
              <Text style={[styles.scanQrSub, { color: colors.textMuted }]}>
                Auto-fill RFC 6238 TOTP secret, issuer & digits via camera
              </Text>
            </View>
          </TouchableOpacity>

          {parsedTotpMeta && (
            <View
              style={[
                styles.parsedBadgeRow,
                {
                  backgroundColor: colors.successGlow,
                  borderColor: colors.success,
                },
              ]}
            >
              <CheckCircle2 size={16} color={colors.success} />
              <Text style={[styles.parsedBadgeText, { color: colors.success }]}>
                Scanned {parsedTotpMeta.issuer} ({parsedTotpMeta.digits} digits ·{' '}
                {parsedTotpMeta.algorithm} · {parsedTotpMeta.period}s)
              </Text>
            </View>
          )}

          <Text style={[styles.sheetFieldLabel, { color: colors.textMuted }]}>
            Website or Service Label
          </Text>
          <TextInput
            collapsable={false}
            style={[
              styles.sheetInput,
              {
                backgroundColor: colors.surfaceSubtle,
                color: colors.text,
                borderColor:
                  focusedField === 'title' ? colors.primary : colors.border,
              },
            ]}
            placeholder="e.g. GitHub, Stripe, AWS"
            placeholderTextColor={colors.textDim}
            value={title}
            onChangeText={setTitle}
            onFocus={() => setFocusedField('title')}
            onBlur={() => setFocusedField(null)}
          />

          <Text style={[styles.sheetFieldLabel, { color: colors.textMuted }]}>
            Username or Email
          </Text>
          <TextInput
            collapsable={false}
            style={[
              styles.sheetInput,
              {
                backgroundColor: colors.surfaceSubtle,
                color: colors.text,
                borderColor:
                  focusedField === 'username' ? colors.primary : colors.border,
              },
            ]}
            placeholder="name@example.com"
            placeholderTextColor={colors.textDim}
            value={username}
            onChangeText={setUsername}
            onFocus={() => setFocusedField('username')}
            onBlur={() => setFocusedField(null)}
            autoCapitalize="none"
          />

          <Text style={[styles.sheetFieldLabel, { color: colors.textMuted }]}>
            Password
          </Text>
          <TextInput
            collapsable={false}
            style={[
              styles.sheetInput,
              {
                backgroundColor: colors.surfaceSubtle,
                color: colors.text,
                borderColor:
                  focusedField === 'password' ? colors.primary : colors.border,
              },
            ]}
            placeholder="Enter strong password..."
            placeholderTextColor={colors.textDim}
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocusedField('password')}
            onBlur={() => setFocusedField(null)}
            secureTextEntry
            autoCapitalize="none"
          />

          <View style={styles.totpLabelRow}>
            <Text style={[styles.sheetFieldLabel, { color: colors.textMuted }]}>
              2FA / TOTP Secret or otpauth:// URI
            </Text>
            <TouchableOpacity
              hitSlop={HIT_SLOP}
              onPress={() => {
                triggerLightHaptic();
                setShowQrScanner(true);
              }}
            >
              <Text style={[styles.inlineScanLink, { color: colors.primary }]}>
                Scan QR
              </Text>
            </TouchableOpacity>
          </View>
          <TextInput
            collapsable={false}
            style={[
              styles.sheetInput,
              {
                backgroundColor: colors.surfaceSubtle,
                color: colors.text,
                borderColor:
                  focusedField === 'totp' ? colors.primary : colors.border,
              },
            ]}
            placeholder="JBSWY3DPEHPK3PXP or otpauth://totp/..."
            placeholderTextColor={colors.textDim}
            value={totpSecret}
            onChangeText={setTotpSecret}
            onFocus={() => setFocusedField('totp')}
            onBlur={() => setFocusedField(null)}
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={[
              styles.sheetPrimaryPillButton,
              { backgroundColor: colors.primary },
            ]}
            hitSlop={HIT_SLOP}
            onPress={handleSavePress}
            activeOpacity={0.85}
          >
            <ShieldCheck size={18} color={colors.onPrimary} />
            <Text
              style={[
                styles.sheetPrimaryPillButtonText,
                { color: colors.onPrimary },
              ]}
            >
              Encrypt & Save Credential
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </DraggableBottomSheet>

      <QrScannerModal
        visible={showQrScanner}
        title="Scan 2FA QR Code"
        subtitle="Point your camera at any standard otpauth://totp/ QR code."
        onClose={() => setShowQrScanner(false)}
        onCodeScanned={handleOtpQrScanned}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sheetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  sheetHeaderAction: {
    minWidth: layout.minTouchTarget,
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
  },
  sheetCancelText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '500',
  },
  sheetHeaderTitle: {
    fontFamily: 'Inter',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  sheetSaveText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
  },
  sheetScrollForm: {
    marginTop: spacing.md,
  },
  scanQrBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1.5,
    marginBottom: spacing.sm,
  },
  scanQrIconCircle: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanQrTitle: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  scanQrSub: {
    fontFamily: 'Inter',
    fontSize: 12,
    marginTop: 2,
  },
  parsedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    marginBottom: spacing.xs,
  },
  parsedBadgeText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '700',
  },
  sheetFieldLabel: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  totpLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inlineScanLink: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 12,
  },
  sheetInput: {
    fontFamily: 'Inter',
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 15,
    borderWidth: 1,
  },
  sheetPrimaryPillButton: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: radii.pill,
    minHeight: layout.minButtonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sheetPrimaryPillButtonText: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
