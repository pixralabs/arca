/**
 * @file apps/mobile/src/App.tsx
 * @description Arca Mobile — Root Application Container with Screen Router and Lifecycle State.
 */

import React, { useState, useEffect } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View, LogBox } from 'react-native';

LogBox.ignoreAllLogs(true);

import { colors } from './theme/theme';
import { getVaultMeta } from './storage/db';
import { UnlockScreen } from './screens/UnlockScreen';
import { SetupScreen } from './screens/SetupScreen';
import { VaultScreen } from './screens/VaultScreen';
import { TotpScreen } from './screens/TotpScreen';
import { GeneratorScreen } from './screens/GeneratorScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SplashScreen } from './screens/SplashScreen';
import { ShareScreen } from './screens/ShareScreen';
import { VaultItemPlaintext } from '@vaultguard/shared';

type Screen = 'SPLASH' | 'UNLOCK' | 'SETUP' | 'VAULT' | 'TOTP' | 'GENERATOR' | 'SETTINGS' | 'SHARE';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('SPLASH');
  const [activeTotpItem, setActiveTotpItem] = useState<VaultItemPlaintext | null>(null);

  useEffect(() => {
    let isMounted = true;
    const startTime = Date.now();

    getVaultMeta('header').then((header) => {
      const elapsed = Date.now() - startTime;
      const minDisplayTime = 1200; // 1.2s branding splash presentation
      const delay = Math.max(0, minDisplayTime - elapsed);

      setTimeout(() => {
        if (!isMounted) return;
        if (!header) {
          setCurrentScreen('SETUP');
        } else {
          setCurrentScreen('UNLOCK');
        }
      }, delay);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={styles.content}>
        {currentScreen === 'SPLASH' && <SplashScreen />}
        {currentScreen === 'SETUP' && (
          <SetupScreen
            onVaultCreated={() => setCurrentScreen('VAULT')}
            onGoToUnlock={() => setCurrentScreen('UNLOCK')}
          />
        )}

        {currentScreen === 'UNLOCK' && (
          <UnlockScreen
            onUnlocked={() => setCurrentScreen('VAULT')}
            onGoToSetup={() => setCurrentScreen('SETUP')}
          />
        )}

        {currentScreen === 'VAULT' && (
          <VaultScreen
            onLock={() => setCurrentScreen('UNLOCK')}
            onGoToGenerator={() => setCurrentScreen('GENERATOR')}
            onGoToTotp={(item) => {
              setActiveTotpItem(item);
              setCurrentScreen('TOTP');
            }}
            onGoToSettings={() => setCurrentScreen('SETTINGS')}
          />
        )}

        {currentScreen === 'TOTP' && activeTotpItem && (
          <TotpScreen
            item={activeTotpItem}
            onBack={() => setCurrentScreen('VAULT')}
          />
        )}

        {currentScreen === 'GENERATOR' && (
          <GeneratorScreen onBack={() => setCurrentScreen('VAULT')} />
        )}

        {currentScreen === 'SETTINGS' && (
          <SettingsScreen
            onBack={() => setCurrentScreen('VAULT')}
            onPurged={() => setCurrentScreen('SETUP')}
          />
        )}

        {currentScreen === 'SHARE' && (
          <ShareScreen onBack={() => setCurrentScreen('VAULT')} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
});
