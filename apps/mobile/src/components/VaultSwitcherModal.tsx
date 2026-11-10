/**
 * @file apps/mobile/src/components/VaultSwitcherModal.tsx
 * @description Premium Edge-to-Edge Reanimated Bottom Sheet for Vault Switching.
 * Ensures zero black gaps behind the Android navigation bar using useSafeAreaInsets(),
 * smooth 60fps spring slide-up animations, 32px corner radius, and Indigo accent selection.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Plus, X } from 'lucide-react-native';
import { useTheme, spacing, radii, HIT_SLOP, triggerLightHaptic } from '../theme/theme';
import type { VaultRecord } from '../storage/db';

const INDIGO_ACCENT = '#6366f1';
const INDIGO_GLOW = 'rgba(99, 102, 241, 0.12)';

export interface VaultSwitcherModalProps {
  visible: boolean;
  vaults: VaultRecord[];
  activeVault: VaultRecord | null;
  onSelectVault: (vault: VaultRecord) => void;
  onCreateVault: () => void;
  onClose: () => void;
}

export function VaultSwitcherModal({
  visible,
  vaults,
  activeVault,
  onSelectVault,
  onCreateVault,
  onClose,
}: VaultSwitcherModalProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get('window').height || 800;

  const translateY = useSharedValue(screenHeight);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 250 });
      translateY.value = withSpring(0, {
        damping: 24,
        stiffness: 240,
        mass: 0.8,
      });
    } else {
      backdropOpacity.value = withTiming(0, { duration: 180 });
      translateY.value = withTiming(screenHeight, { duration: 200 });
    }
  }, [visible, screenHeight, translateY, backdropOpacity]);

  const handleDismiss = () => {
    triggerLightHaptic();
    backdropOpacity.value = withTiming(0, { duration: 180 });
    translateY.value = withTiming(screenHeight, { duration: 200 }, () => {
      runOnJS(onClose)();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.value = gestureState.dy;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.8) {
          handleDismiss();
        } else {
          translateY.value = withSpring(0, { damping: 24, stiffness: 240 });
        }
      },
    })
  ).current;

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent={Platform.OS === 'android'}
      onRequestClose={handleDismiss}
    >
      <View style={StyleSheet.absoluteFill}>
        {/* Dark semi-transparent fade-in backdrop */}
        <TouchableWithoutFeedback onPress={handleDismiss}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(0, 0, 0, 0.70)' },
              backdropAnimatedStyle,
            ]}
          />
        </TouchableWithoutFeedback>

        {/* Edge-to-Edge Sheet Container extending to the absolute bottom */}
        <Animated.View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: isDark ? '#121214' : colors.surface,
              borderColor: isDark ? '#27272a' : colors.border,
              paddingBottom: Math.max(insets.bottom, 16) + 16,
            },
            sheetAnimatedStyle,
          ]}
        >
          {/* Centered Grey Pill Handle Bar */}
          <View {...panResponder.panHandlers} style={styles.handleArea}>
            <View
              style={[
                styles.handlePill,
                { backgroundColor: isDark ? '#52525b' : '#d4d4d8' },
              ]}
            />
          </View>

          {/* Modal Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderDetails}>
              <Text style={[styles.sheetTitle, { color: colors.textHeading }]}>
                Select Vault
              </Text>
              <Text style={[styles.sheetSubtitle, { color: colors.textMuted }]}>
                Isolated zero-knowledge vaults on this device
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              hitSlop={HIT_SLOP}
              onPress={handleDismiss}
            >
              <X size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Vaults Scrollable List */}
          <ScrollView
            style={styles.vaultListScroll}
            contentContainerStyle={styles.vaultListContent}
            showsVerticalScrollIndicator={false}
          >
            {vaults.map((v) => {
              const isSelected = activeVault?.id === v.id;
              return (
                <TouchableOpacity
                  key={v.id}
                  style={[
                    styles.vaultCard,
                    {
                      backgroundColor: isSelected
                        ? (isDark ? '#1a1b26' : INDIGO_GLOW)
                        : (isDark ? '#18181b' : '#ffffff'),
                      borderColor: isSelected
                        ? INDIGO_ACCENT
                        : (isDark ? '#27272a' : '#e4e4e7'),
                      borderWidth: isSelected ? 1.5 : 1,
                    },
                  ]}
                  onPress={() => {
                    triggerLightHaptic();
                    onSelectVault(v);
                  }}
                  activeOpacity={0.75}
                >
                  <View style={styles.vaultCardLeft}>
                    <View
                      style={[
                        styles.vaultAvatar,
                        {
                          backgroundColor: isSelected
                            ? INDIGO_ACCENT
                            : (isDark ? '#27272a' : '#f4f4f5'),
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.vaultAvatarText,
                          {
                            color: isSelected
                              ? '#ffffff'
                              : (isDark ? '#ffffff' : '#18181b'),
                            fontWeight: '700',
                          },
                        ]}
                      >
                        {v.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.vaultDetails}>
                      <Text
                        style={[
                          styles.vaultNameText,
                          {
                            color: colors.textHeading,
                            fontWeight: isSelected ? '700' : '600',
                          },
                        ]}
                      >
                        {v.name}
                      </Text>
                      <Text
                        style={[
                          styles.vaultMetaText,
                          {
                            color: isSelected
                              ? (isDark ? '#a5b4fc' : INDIGO_ACCENT)
                              : colors.textDim,
                          },
                        ]}
                      >
                        Argon2id + XChaCha20-Poly1305
                      </Text>
                    </View>
                  </View>

                  {isSelected && (
                    <View style={[styles.checkBadge, { backgroundColor: INDIGO_ACCENT }]}>
                      <Check size={14} color="#ffffff" strokeWidth={2.5} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Create Another Vault Button */}
          <TouchableOpacity
            style={[
              styles.createVaultBtn,
              {
                borderColor: isDark ? '#27272a' : '#e4e4e7',
                backgroundColor: isDark ? '#18181b' : '#ffffff',
              },
            ]}
            onPress={() => {
              handleDismiss();
              onCreateVault();
            }}
            activeOpacity={0.8}
          >
            <Plus size={18} color={colors.text} />
            <Text style={[styles.createVaultBtnText, { color: colors.text }]}>
              Create Another Vault
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: 1,
    paddingHorizontal: spacing.xl,
    maxHeight: '85%',
  },
  handleArea: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 16,
  },
  handlePill: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  sheetHeaderDetails: {
    flex: 1,
  },
  sheetTitle: {
    fontFamily: 'Inter',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  sheetSubtitle: {
    fontFamily: 'Inter',
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  vaultListScroll: {
    maxHeight: 280,
    marginBottom: spacing.lg,
  },
  vaultListContent: {
    gap: 10,
  },
  vaultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.xl,
    minHeight: 64,
  },
  vaultCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  vaultAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultAvatarText: {
    fontFamily: 'Inter',
    fontSize: 16,
  },
  vaultDetails: {
    flex: 1,
  },
  vaultNameText: {
    fontFamily: 'Inter',
    fontSize: 15,
    letterSpacing: -0.2,
  },
  vaultMetaText: {
    fontFamily: 'Inter',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createVaultBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radii.pill,
    minHeight: 52,
  },
  createVaultBtnText: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
  },
});

