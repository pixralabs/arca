/**
 * @file apps/mobile/src/App.tsx
 * @description Arca Mobile — Root Application Container with Dynamic Dark/Light Theme,
 * Spring-Based Screen Transitions (`react-native-reanimated`), Tactile Haptics,
 * Root/Jailbreak Anti-Tamper Detection (`jail-monkey`), OS-Level `FLAG_SECURE` Guard,
 * and Shimmering Skeleton Loaders during initialization.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  StatusBar,
  StyleSheet,
  View,
  Text,
  Alert,
  LogBox,
  NativeModules,
} from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { SafeAreaView } from './components/SafeAreaView';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useTheme,
  AnimatedScreen,
  VaultSkeletonLoader,
  triggerLightHaptic,
} from './theme/theme';
import type { VaultItemPlaintext } from '@vaultguard/shared';
import { getVaultMeta, getAllVaults } from './storage/db';
import {
  isDeviceCompromised,
  setFlagSecure,
  SECURITY_COMPROMISED_WARNING,
} from './crypto/securityGuard';
import { SetupScreen } from './screens/SetupScreen';
import { UnlockScreen } from './screens/UnlockScreen';
import { VaultScreen } from './screens/VaultScreen';
import { TotpScreen } from './screens/TotpScreen';
import { GeneratorScreen } from './screens/GeneratorScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ShareScreen } from './screens/ShareScreen';
import { RecoveryKitScreen } from './screens/RecoveryKitScreen';
import codePush, { CodePushOptions } from 'react-native-code-push';

const { ArcaSplashScreen } = NativeModules;

LogBox.ignoreAllLogs(true);

type Screen = 'UNLOCK' | 'SETUP' | 'VAULT' | 'TOTP' | 'GENERATOR' | 'SETTINGS' | 'SHARE' | 'RECOVERY_KIT';

const codePushOptions: CodePushOptions = {
  checkFrequency: codePush.CheckFrequency.ON_APP_RESUME,
  installMode: codePush.InstallMode.ON_NEXT_RESUME,
  mandatoryInstallMode: codePush.InstallMode.IMMEDIATE,
  deploymentKey: 'HrZTHeXrYf5jDQbw6iXcWU-BksP8yZrN7mAIqTbThW', // <-- Ye aapki Staging Deployment Key hai
};

function App() {
  const { colors, isDark } = useTheme();
  const [isInitializing, setIsInitializing] = useState(true);
  const [currentScreen, setCurrentScreen] = useState<Screen>('SETUP');
  const [activeTotpItem, setActiveTotpItem] = useState<VaultItemPlaintext | null>(null);
  const [deviceCompromised, setDeviceCompromised] = useState(false);

  const navigateTo = useCallback((nextScreen: Screen) => {
    triggerLightHaptic();
    setCurrentScreen(nextScreen);
  }, []);

  useEffect(() => {
    ArcaSplashScreen?.setSystemBarsTheme?.(isDark);
  }, [isDark]);

  // Enforce FLAG_SECURE on UnlockScreen and VaultScreen (and globally via MainActivity.kt)
  useEffect(() => {
    if (currentScreen === 'UNLOCK' || currentScreen === 'VAULT') {
      setFlagSecure(true);
    }
  }, [currentScreen]);

  // Startup Anti-Tamper Root/Jailbreak Check (`jail-monkey`)
  useEffect(() => {
    if (isDeviceCompromised()) {
      setDeviceCompromised(true);
      Alert.alert('Security Warning', SECURITY_COMPROMISED_WARNING);
    }
  }, []);

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
      <SafeAreaProvider
        initialMetrics={initialWindowMetrics}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <StatusBar
          translucent
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor="transparent"
        />
        <SafeAreaView
          edges={['top', 'bottom']}
          style={[styles.container, { backgroundColor: colors.background }]}
        >
          {deviceCompromised && (
            <View style={styles.compromisedBanner}>
              <Text style={styles.compromisedBannerText}>
                {SECURITY_COMPROMISED_WARNING}
              </Text>
            </View>
          )}
          <VaultSkeletonLoader />
        </SafeAreaView>
      </SafeAreaProvider>
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
            onOpenRecoveryKit={() => navigateTo('RECOVERY_KIT')}
            onPurged={() => {
              AsyncStorage.removeItem('@arca_vault_created').catch(() => {});
              navigateTo('SETUP');
            }}
          />
        );
      case 'RECOVERY_KIT':
        return (
          <RecoveryKitScreen
            vaultName="Personal Vault"
            mnemonicWords={[
              'abandon', 'ability', 'able', 'about', 'above', 'absent',
              'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident',
              'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire',
              'across', 'act', 'action', 'actor', 'actress', 'actual'
            ]}
            onComplete={() => navigateTo('SETTINGS')}
          />
        );
      case 'SHARE':
        return <ShareScreen onBack={() => navigateTo('VAULT')} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaProvider
      initialMetrics={initialWindowMetrics}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <StatusBar
        translucent
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
      />
      <View style={[styles.content, { backgroundColor: colors.background }]}>
        {deviceCompromised && (
          <View style={styles.compromisedBanner}>
            <Text style={styles.compromisedBannerText}>
              {SECURITY_COMPROMISED_WARNING}
            </Text>
          </View>
        )}
        <AnimatedScreen key={currentScreen}>{renderScreen()}</AnimatedScreen>
      </View>
    </SafeAreaProvider>
  );
}

export default codePush(codePushOptions)(App);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  compromisedBanner: {
    backgroundColor: '#dc2626',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  compromisedBannerText: {
    color: '#ffffff',
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
