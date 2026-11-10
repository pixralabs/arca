/**
 * @file apps/mobile/src/components/QrScannerModal.tsx
 * @description Reusable 60FPS Camera QR Code Scanner powered by `react-native-vision-camera`.
 * Supports both TOTP (`otpauth://totp/...`) and Device Pairing (`VG_QR_SYNC_V1`) QR codes,
 * with Reanimated scan reticle, Haptic feedback, and Emulator/Paste fallback.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import { Camera as CameraIcon, X, Sparkles, Keyboard as KeyboardIcon } from 'lucide-react-native';
import {
  useTheme,
  spacing,
  radii,
  layout,
  HIT_SLOP,
  triggerLightHaptic,
  triggerSuccessHaptic,
  triggerErrorHaptic,
} from '../theme/theme';

export interface QrScannerModalProps {
  visible: boolean;
  title: string;
  subtitle: string;
  placeholderHint?: string;
  onClose: () => void;
  onCodeScanned: (value: string) => void;
}

export function QrScannerModal({
  visible,
  title,
  subtitle,
  placeholderHint = 'otpauth://totp/GitHub:radhe?secret=JBSWY3DPEHPK3PXP&issuer=GitHub',
  onClose,
  onCodeScanned,
}: QrScannerModalProps) {
  const { colors } = useTheme();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const hasScannedRef = useRef(false);

  const laserY = useSharedValue(0);
  const sheetY = useSharedValue(600);

  useEffect(() => {
    if (visible) {
      hasScannedRef.current = false;
      setShowManualEntry(false);
      setManualValue('');
      sheetY.value = withSpring(0, { damping: 22, stiffness: 210 });
      laserY.value = withRepeat(withTiming(210, { duration: 1600 }), -1, true);
      if (!hasPermission) {
        void requestPermission();
      }
    } else {
      sheetY.value = 600;
    }
  }, [visible, hasPermission, requestPermission, laserY, sheetY]);

  const laserAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: laserY.value }],
  }));

  const modalSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      if (hasScannedRef.current || !codes || codes.length === 0) return;
      const rawValue = codes[0]?.value;
      if (rawValue) {
        hasScannedRef.current = true;
        triggerSuccessHaptic();
        onCodeScanned(rawValue);
      }
    },
  });

  const handleManualSubmit = () => {
    const trimmed = manualValue.trim();
    if (!trimmed) {
      triggerErrorHaptic();
      return;
    }
    triggerSuccessHaptic();
    onCodeScanned(trimmed);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.backdrop }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardWrapper}
        >
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
              modalSlideStyle,
            ]}
          >
            {/* Header */}
            <View style={styles.headerRow}>
              <View style={{ flex: 1, paddingRight: spacing.md }}>
                <Text style={[styles.title, { color: colors.textHeading }]}>
                  {title}
                </Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                  {subtitle}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.closeCircle,
                  { backgroundColor: colors.surfaceSubtle },
                ]}
                hitSlop={HIT_SLOP}
                onPress={() => {
                  triggerLightHaptic();
                  onClose();
                }}
              >
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Camera Viewfinder OR Manual Fallback */}
            {!showManualEntry && hasPermission && device ? (
              <View style={[styles.cameraContainer, { borderColor: colors.primary }]}>
                <Camera
                  style={StyleSheet.absoluteFill}
                  device={device}
                  isActive={visible && !showManualEntry}
                  codeScanner={codeScanner}
                />
                {/* Corner Reticle & Indigo Laser */}
                <View style={styles.reticleFrame}>
                  <Animated.View
                    style={[
                      styles.laserLine,
                      {
                        backgroundColor: colors.primary,
                        shadowColor: colors.primary,
                      },
                      laserAnimatedStyle,
                    ]}
                  />
                </View>
                <View
                  style={[
                    styles.cameraBadge,
                    { backgroundColor: 'rgba(0, 0, 0, 0.85)' },
                  ]}
                >
                  <Sparkles size={13} color={colors.primary} />
                  <Text style={[styles.cameraBadgeText, { color: colors.textHeading }]}>
                    Point camera at QR code
                  </Text>
                </View>
              </View>
            ) : (
              <View
                style={[
                  styles.fallbackBox,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                {!hasPermission && !showManualEntry ? (
                  <>
                    <CameraIcon size={32} color={colors.primary} />
                    <Text style={[styles.fallbackTitle, { color: colors.textHeading }]}>
                      Camera Access Required
                    </Text>
                    <Text style={[styles.fallbackSub, { color: colors.textMuted }]}>
                      Grant camera permission to scan QR codes directly, or paste the code below.
                    </Text>
                    <TouchableOpacity
                      style={[styles.primaryPillBtn, { backgroundColor: colors.primary }]}
                      hitSlop={HIT_SLOP}
                      onPress={() => {
                        triggerLightHaptic();
                        void requestPermission();
                      }}
                    >
                      <Text style={[styles.primaryPillBtnText, { color: colors.onPrimary }]}>
                        Grant Camera Permission
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={{ width: '100%' }}>
                    <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                      Paste QR Payload or otpauth:// URI
                    </Text>
                    <TextInput
                      style={[
                        styles.manualInput,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.primary,
                          color: colors.text,
                        },
                      ]}
                      placeholder={placeholderHint}
                      placeholderTextColor={colors.textDim}
                      value={manualValue}
                      onChangeText={setManualValue}
                      autoCapitalize="none"
                      autoCorrect={false}
                      multiline
                    />
                    <TouchableOpacity
                      style={[styles.primaryPillBtn, { backgroundColor: colors.primary }]}
                      hitSlop={HIT_SLOP}
                      onPress={handleManualSubmit}
                    >
                      <Text style={[styles.primaryPillBtnText, { color: colors.onPrimary }]}>
                        Verify & Apply QR Code
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Toggle Manual / Camera Mode Pill Button */}
            <TouchableOpacity
              style={[
                styles.secondaryPillBtn,
                { backgroundColor: colors.surfaceSubtle },
              ]}
              hitSlop={HIT_SLOP}
              onPress={() => {
                triggerLightHaptic();
                setShowManualEntry((v) => !v);
              }}
            >
              <KeyboardIcon size={16} color={colors.text} />
              <Text style={[styles.secondaryPillBtnText, { color: colors.text }]}>
                {showManualEntry ? 'Switch to Live Camera Scanner' : 'Enter or Paste Code Manually'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  keyboardWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    borderTopWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: 'Inter',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: 'Inter',
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  closeCircle: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraContainer: {
    width: '100%',
    height: 260,
    borderRadius: radii.card,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  reticleFrame: {
    width: 220,
    height: 220,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: 20,
    overflow: 'hidden',
  },
  laserLine: {
    width: '100%',
    height: 3,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 5,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  cameraBadgeText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
  },
  fallbackBox: {
    width: '100%',
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  fallbackTitle: {
    fontFamily: 'Inter',
    fontSize: 17,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  fallbackSub: {
    fontFamily: 'Inter',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: spacing.lg,
    lineHeight: 18,
  },
  inputLabel: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  manualInput: {
    fontFamily: 'monospace',
    fontSize: 13,
    borderWidth: 1.5,
    borderRadius: radii.lg,
    padding: spacing.md,
    minHeight: 88,
    textAlignVertical: 'top',
    marginBottom: spacing.md,
  },
  primaryPillBtn: {
    width: '100%',
    minHeight: layout.minButtonHeight,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryPillBtnText: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryPillBtn: {
    width: '100%',
    minHeight: layout.minButtonHeight,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryPillBtnText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
  },
});

