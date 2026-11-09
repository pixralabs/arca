/**
 * @file apps/mobile/src/App.tsx
 * @description Arca Mobile — Root Application Container with Dynamic Dark/Light Theme,
 * Spring-Based Screen Transitions (`react-native-reanimated`), Tactile Haptics,
 * and Shimmering Skeleton Loaders during initialization.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  LogBox,
  NativeModules,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useTheme,
  AnimatedScreen,
  VaultSkeletonLoader,
  triggerLightHaptic,
} from './theme/theme';
import type { VaultItemPlaintext } from '@vaultguard/shared';
import { getVaultMeta, getAllVaults } from './storage/db';
import { SetupScreen } from './screens/SetupScreen';
import { UnlockScreen } from './screens/UnlockScreen';
import { VaultScreen } from './screens/VaultScreen';
import { TotpScreen } from './screens/TotpScreen';
import { GeneratorScreen } from './screens/GeneratorScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ShareScreen } from './screens/ShareScreen';

const { ArcaSplashScreen } = NativeModules;

LogBox.ignoreAllLogs(true);

type Screen = 'UNLOCK' | 'SETUP' | 'VAULT' | 'TOTP' | 'GENERATOR' | 'SETTINGS' | 'SHARE';

export default function App() {
  const { colors, isDark } = useTheme();
  const [isInitializing, setIsInitializing] = useState(true);
  const [currentScreen, setCurrentScreen] = useState<Screen>('SETUP');
  const [activeTotpItem, setActiveTotpItem] = useState<VaultItemPlaintext | null>(null);

  const navigateTo = useCallback((nextScreen: Screen) => {
    triggerLightHaptic();
    setCurrentScreen(nextScreen);
  }, []);

  useEffect(() => {
    ArcaSplashScreen?.setSystemBarsTheme?.(isDark);
  }, [isDark]);

  useEffect(() => {
    let isMounted = true;

    AsyncStorage.getItem('@arca_vault_created')
      .then((created: string | null) => {
        if (!isMounted) return;
        if (created === 'true') {
          setCurrentScreen('UNLOCK');
        } else {
          setCurrentScreen('SETUP');
        }
        setIsInitializing(false);
        ArcaSplashScreen?.hide();
      })
      .catch(() => {
        if (!isMounted) return;
        setIsInitializing(false);
        ArcaSplashScreen?.hide();
      });

    const timer = setTimeout(async () => {
      try {
        const vaults = await getAllVaults();
        if (!isMounted) return;
        if (vaults.length > 0) {
          await AsyncStorage.setItem('@arca_vault_created', 'true');
        } else {
          const header = await getVaultMeta('header');
          if (header) {
            await AsyncStorage.setItem('@arca_vault_created', 'true');
          } else {
            await AsyncStorage.setItem('@arca_vault_created', 'false');
          }
        }
      } catch {
        // Fallback gracefully
      }
    }, 500);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  // Show smooth shimmering skeleton loader while checking initial vault state
  if (isInitializing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar
          translucent
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor="transparent"
        />
        <VaultSkeletonLoader />
      </SafeAreaView>
    );
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case 'SETUP':
        return (
          <SetupScreen
            onVaultCreated={() => {
              AsyncStorage.setItem('@arca_vault_created', 'true').catch(() => {});
              navigateTo('VAULT');
            }}
            onGoToUnlock={() => navigateTo('UNLOCK')}
          />
        );
      case 'UNLOCK':
        return (
          <UnlockScreen
            onUnlocked={() => navigateTo('VAULT')}
            onGoToSetup={() => navigateTo('SETUP')}
          />
        );
      case 'VAULT':
        return (
          <VaultScreen
            onLock={() => navigateTo('UNLOCK')}
            onGoToGenerator={() => navigateTo('GENERATOR')}
            onGoToTotp={(item: VaultItemPlaintext) => {
              setActiveTotpItem(item);
              navigateTo('TOTP');
            }}
            onGoToSettings={() => navigateTo('SETTINGS')}
          />
        );
      case 'TOTP':
        if (!activeTotpItem) return null;
        return (
          <TotpScreen
            item={activeTotpItem}
            onBack={() => navigateTo('VAULT')}
          />
        );
      case 'GENERATOR':
        return <GeneratorScreen onBack={() => navigateTo('VAULT')} />;
      case 'SETTINGS':
        return (
          <SettingsScreen
            onBack={() => navigateTo('VAULT')}
            onPurged={() => {
              AsyncStorage.removeItem('@arca_vault_created').catch(() => {});
              navigateTo('SETUP');
            }}
          />
        );
      case 'SHARE':
        return <ShareScreen onBack={() => navigateTo('VAULT')} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        translucent
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
      />
      <View style={[styles.content, { backgroundColor: colors.background }]}>
        <AnimatedScreen key={currentScreen}>{renderScreen()}</AnimatedScreen>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
