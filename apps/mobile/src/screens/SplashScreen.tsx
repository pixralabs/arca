/**
 * @file apps/mobile/src/screens/SplashScreen.tsx
 * @description Arca Mobile — Brand Splash Screen with animated glowing lock logo,
 * zero-knowledge security badges, and smooth fade-out transition.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { colors, radii, spacing } from '../theme/theme';

interface SplashScreenProps {
  onFinish?: () => void;
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Intro animation: Fade in and spring scale
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Subtle breathing pulse for the glowing logo
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.04,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    return () => {
      pulseLoop.stop();
    };
  }, [fadeAnim, scaleAnim, pulseAnim]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#09090b" />

      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: Animated.multiply(scaleAnim, pulseAnim) }],
          },
        ]}
      >
        {/* Glowing Padlock Icon */}
        <View style={styles.iconGlowWrapper}>
          <Image
            source={require('../assets/icon_dark.jpg')}
            style={styles.logoImage}
            resizeMode="cover"
          />
        </View>

        {/* Brand Heading */}
        <View style={styles.brandContainer}>
          <Text style={styles.brandTitle}>ARCA</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>BY PIXRA</Text>
          </View>
        </View>

        {/* Subtitle & Architecture Badges */}
        <Text style={styles.subtitle}>Zero-Knowledge Privacy Vault</Text>
        <Text style={styles.subtext}>XChaCha20-Poly1305 • Argon2id • Blind Sync</Text>
      </Animated.View>

      {/* Subtle Bottom Loading Indicator */}
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={colors.emerald} />
        <Text style={styles.footerText}>Initializing Cryptographic Engine...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconGlowWrapper: {
    width: 140,
    height: 140,
    borderRadius: 38,
    backgroundColor: '#15171e',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(16, 185, 129, 0.45)',
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
    marginBottom: spacing.xl,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  brandTitle: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 6,
  },
  badge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeText: {
    color: colors.emerald,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  subtitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtext: {
    color: colors.textDim,
    fontSize: 12,
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 50,
    alignItems: 'center',
    gap: spacing.sm,
  },
  footerText: {
    color: colors.textDim,
    fontSize: 12,
    letterSpacing: 0.5,
  },
});
