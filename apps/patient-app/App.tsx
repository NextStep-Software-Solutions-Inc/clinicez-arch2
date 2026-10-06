import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Navigation, navigationRef } from './navigation/Navigation';
import { linking } from './navigation/linking';
import WebShell from 'components/ui/WebShell';
import { useOTAUpdate } from 'hooks/useOTAUpdate';
import { DefaultTheme, DarkTheme, MaterialDarkTheme, MaterialLightTheme, Theme, ThemeProvider } from "@react-navigation/native";
import { ColorValue, Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { AuthProvider, useAuth } from 'contexts/AuthContext';
import CustomAlertModal from 'components/ui/CustomAlertModal';
import { OnboardingProvider } from 'contexts/OnboardingContext';
import { AppearanceProvider, useAppearance } from 'contexts/AppearanceContext';
import { NotificationProvider } from 'contexts/NotificationContext';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { resourceCache } from '@clerk/expo/resource-cache'
import DatabaseProvider from 'components/DatabaseProvider';
import SyncManager from 'components/SyncManager';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OfflineAlertProvider } from 'contexts/OfflineAlertContext';
import { useIsLocked } from 'hooks/useNavState';
import LockScreen from './navigation/screens/Lock.screen';
import UnlockScreen from './navigation/screens/Unlock.screen';
import * as ExpoNotifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { ErrorBoundary } from 'components/ui/ErrorBoundary';
import { scheduleLocalNotification } from 'services/notifications/notificationService';

// ─── Background notification task ─────────────────────────────────────────────
// This task runs when a push notification is received while the app is
// killed or in the background. It lets the OS deliver the notification
// and keeps the notification handler available at the module level.
// Note: on iOS the task only fires when the app is woken by a background
// push (content-available: 1). Android handles background delivery via FCM
// without needing this task.
const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';

if (Platform.OS !== 'web') {
  TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
    if (error) {
      console.error('[BackgroundNotification] Task error:', error);
      return;
    }
    
    const payload = data as any;
    const raw = payload.notification?.request?.content;
    if (!raw) return;
    
    const rawData = raw.data as Record<string, any>;
    
    // If a silent push contains title/body inside the data payload (significant change),
    // we wake up and display it as a local follow-up notification.
    if (rawData?.title && rawData?.body) {
      await scheduleLocalNotification(
        rawData.title,
        rawData.body,
        rawData,
        null // Trigger immediately
      );
    }
  });

  // Show banners, sounds, and badges while app is in foreground
  ExpoNotifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  // Register the background task so expo-notifications knows to wake it.
  // Must be called before the app renders (module level).
  ExpoNotifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(
    // Swallow the error — on Expo Go / simulators this will throw because
    // background tasks are not supported; it is safe to ignore.
    () => { },
  );
}

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

function LockOverlay({ backgroundColor }: { backgroundColor: ColorValue }) {
  const isLocked = useIsLocked();
  const [screen, setScreen] = useState<'locked' | 'unlock'>('locked');

  useEffect(() => {
    if (!isLocked) setScreen('locked');
  }, [isLocked]);

  if (!isLocked) return null;

  return (
    <View style={[styles.lockOverlay, { backgroundColor }]}>
      {screen === 'unlock' ? <UnlockScreen /> : <LockScreen onUnlockPress={() => setScreen('unlock')} />}
    </View>
  );
}

function AppWithTheme() {
  const systemScheme = useColorScheme();
  const { themePreference } = useAppearance();
  const { showUserNotFoundAlert, setShowUserNotFoundAlert, userId, logout } = useAuth();

  useOTAUpdate();

  const isDarkMode =
    themePreference === 'dark'
      ? true
      : themePreference === 'light'
        ? false
        : systemScheme === 'dark';

  const selectedTheme = Platform.select<Theme>({
    ios: isDarkMode ? DarkTheme : DefaultTheme,
    android: isDarkMode ? MaterialDarkTheme : MaterialLightTheme,
  }) ?? DefaultTheme;

  return (
    <>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <DatabaseProvider>
        <SyncManager />
        <NotificationProvider>
          <BottomSheetModalProvider>
            <ThemeProvider value={selectedTheme}>
              <OfflineAlertProvider>
                <WebShell>
                  <Navigation ref={navigationRef} theme={selectedTheme} linking={linking} />
                  <LockOverlay backgroundColor={selectedTheme.colors.background} />
                </WebShell>
                <CustomAlertModal
                  visible={showUserNotFoundAlert}
                  title="Account Not Found"
                  message={`The user profile for Clerk ID: "${userId || ''}" was not found in our database. Please contact support or register your account.`}
                  buttonText="Sign Out"
                  icon="❌"
                  onClose={async () => {
                    setShowUserNotFoundAlert(false);
                    await logout();
                  }}
                />
              </OfflineAlertProvider>
            </ThemeProvider>
          </BottomSheetModalProvider>
        </NotificationProvider>
      </DatabaseProvider>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ClerkProvider
          publishableKey={publishableKey}
          tokenCache={Platform.OS !== 'web' ? tokenCache : undefined}
          __experimental_resourceCache={Platform.OS !== 'web' ? resourceCache : undefined}
        >
          <AppearanceProvider>
            <OnboardingProvider>
              <AuthProvider>
                <ErrorBoundary>
                  <AppWithTheme />
                </ErrorBoundary>
              </AuthProvider>
            </OnboardingProvider>
          </AppearanceProvider>
        </ClerkProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  lockOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1000,
  },
});
