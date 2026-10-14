import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { sounds } from '../audio/sounds';
import { Splash } from '../components/Splash';
import { LocaleContext } from '../i18n';
import { SaveProvider, useSave } from '../store/SaveProvider';
import { palette } from '../theme';

const MIN_SPLASH_MS = 1100;

function AppShell() {
  const { hydrated, settings } = useSave();
  const [minElapsed, setMinElapsed] = useState(false);
  const [splashGone, setSplashGone] = useState(false);

  useEffect(() => {
    sounds.init();
    const id = setTimeout(() => setMinElapsed(true), settings.reduceMotion ? 300 : MIN_SPLASH_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sounds.configure({ sound: settings.sound, music: settings.music, haptics: settings.haptics });
  }, [settings.sound, settings.music, settings.haptics]);

  return (
    <LocaleContext.Provider value={settings.language}>
      <View style={{ flex: 1, backgroundColor: palette.night }}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.night },
            animation: settings.reduceMotion ? 'fade' : 'slide_from_right',
          }}
        >
          <Stack.Screen name="game/[id]" options={{ animation: settings.reduceMotion ? 'fade' : 'fade_from_bottom', gestureEnabled: false }} />
        </Stack>
        {!splashGone && <Splash visible={!(hydrated && minElapsed)} onHidden={() => setSplashGone(true)} />}
      </View>
    </LocaleContext.Provider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SaveProvider>
        <AppShell />
      </SaveProvider>
    </SafeAreaProvider>
  );
}
