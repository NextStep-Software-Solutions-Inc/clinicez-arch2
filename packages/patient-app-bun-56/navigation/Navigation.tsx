import { createNativeStackNavigator, createNativeStackScreen } from '@react-navigation/native-stack';
import { createStaticNavigation, StaticParamList } from '@react-navigation/native';
import { createBottomTabNavigator, createBottomTabScreen } from '@react-navigation/bottom-tabs';
import { Platform } from 'react-native';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';

// Screens
import HomeScreen from './screens/Home.screen';
import ProfileScreen from './screens/Profile.screen';
import SettingsScreen from './screens/Settings.screen';
import FilesScreen from './screens/Files.screen';
import ExploreClinicsScreen from './screens/ExploreClinics.screen';
import ExploreOrgsScreen from './screens/ExploreOrgs.screen';
import AppointmentsScreen from './screens/Appointments.screen';
import LoginScreen from './screens/Login.screen';
import SignupScreen from './screens/Signup.screen';
import VerifyScreen from './screens/Verify.screen';
import ForgotPasswordScreen from './screens/ForgotPassword.screen';
import LockScreen from './screens/Lock.screen';
import UnlockScreen from './screens/Unlock.screen';
import WelcomeScreen from './screens/Welcome.screen';
import OnboardScreen from './screens/Onboard.screen';
import CreatePINScreen from './screens/CreatePIN.screen';
import NotificationScreen from './screens/Notification.screen';
import LoadingScreen from './screens/Loading.screen';

// Settings sub-screens
import SecuritySettingsScreen from './screens/settings/SecuritySettings.screen';
import ChangePINScreen from './screens/settings/ChangePIN.screen';
import AppearanceSettingsScreen from './screens/settings/AppearanceSettings.screen';
import NotificationsSettingsScreen from './screens/settings/NotificationsSettings.screen';
import AboutSettingsScreen from './screens/settings/AboutSettings.screen';
import DebugSettingsScreen from './screens/settings/DebugSettings.screen';

// Navigation state hooks
import {
  useIsAppLoading,
  useIsOnboarding,
  useIsInAuthFlow,
  useIsSettingUpPIN,
  useIsLocked,
  useIsUnlocked,
} from 'hooks/useNavState';

import BottomTabsHeaderRight from '../components/BottomTabsHeaderRight';

export type RootStackType = typeof RootStack;

declare module '@react-navigation/core' {
  export interface RootNavigator extends RootStackType {}
}

// ── Bottom Tabs ───────────────────────────────────────────────────────────────

const MainBottomTabs = createBottomTabNavigator({
  screenOptions: {
    tabBarStyle: {
      backgroundColor: isLiquidGlassSupported ? 'transparent' : undefined,
    },
  },
  screens: {
    HomeScreen: createBottomTabScreen({
      screen: HomeScreen,
      options: {
        title: 'Home',
        tabBarIcon: Platform.select({
          android: { type: 'materialSymbol', name: 'home' },
          ios: { type: 'sfSymbol', name: 'house.fill' },
        }),
      },
    }),
    AppointmentsScreen: createBottomTabScreen({
      screen: AppointmentsScreen,
      options: {
        title: 'Health',
        tabBarIcon: Platform.select({
          android: { type: 'materialSymbol', name: 'health_and_safety' },
          ios: { type: 'sfSymbol', name: 'heart.fill' },
        }),
      },
    }),
    FilesScreen: createBottomTabScreen({
      screen: FilesScreen,
      options: {
        title: 'Files',
        tabBarIcon: Platform.select({
          android: { type: 'materialSymbol', name: 'files' },
          ios: { type: 'sfSymbol', name: 'doc.fill' },
        }),
      },
    }),
    ProfileScreen: createBottomTabScreen({
      screen: ProfileScreen,
      options: {
        title: 'Profile',
        tabBarIcon: Platform.select({
          android: { type: 'materialSymbol', name: 'person' },
          ios: { type: 'sfSymbol', name: 'person.fill' },
        }),
      },
    }),
  },
});

// ── Onboarding Stack ──────────────────────────────────────────────────────────

const OnboardingStack = createNativeStackNavigator({
  screens: {
    Welcome: createNativeStackScreen({
      screen: WelcomeScreen,
      options: { headerShown: false },
    }),
    Onboard: createNativeStackScreen({
      screen: OnboardScreen,
      options: { headerShown: false },
    }),
  },
});

// ── Auth Stack ────────────────────────────────────────────────────────────────

const AuthStack = createNativeStackNavigator({
  screens: {
    Login: createNativeStackScreen({
      screen: LoginScreen,
      options: { title: 'Sign in', headerBackVisible: false },
    }),
    Signup: createNativeStackScreen({
      screen: SignupScreen,
      options: { title: 'Create account' },
    }),
    Verify: createNativeStackScreen({
      screen: VerifyScreen,
      options: { title: 'Verify email' },
    }),
    ForgotPassword: createNativeStackScreen({
      screen: ForgotPasswordScreen,
      options: { title: 'Forgot password' },
    }),
  },
});

// ── Setup PIN Stack ───────────────────────────────────────────────────────────

const SetupPINStack = createNativeStackNavigator({
  screens: {
    CreatePIN: createNativeStackScreen({
      screen: CreatePINScreen,
      options: { 
        title: 'Create PIN', 
        headerBackVisible: false, 
        headerShown: false
       },
    }),
  },
});

// ── Lock Stack ────────────────────────────────────────────────────────────────

const LockStack = createNativeStackNavigator({
  screens: {
    Lock: createNativeStackScreen({
      screen: LockScreen,
      options: { headerShown: false },
    }),
    Unlock: createNativeStackScreen({
      screen: UnlockScreen,
      options: { title: 'Unlock', headerBackVisible: false, headerShown: false  },
    }),
  },
});

// ── Main Stack ────────────────────────────────────────────────────────────────

const MainStack = createNativeStackNavigator({
  screenOptions: {
    headerStyle: {
      backgroundColor: isLiquidGlassSupported ? 'transparent' : undefined,
    },
  },
  screens: {
    BottomTabs: createNativeStackScreen({
      screen: MainBottomTabs,
      options: {
        title: 'Clinic EZ',
        headerLargeTitleEnabled: true,
        headerRight: BottomTabsHeaderRight,
        headerBackVisible: false,
      },
    }),
    SettingsScreen: createNativeStackScreen({
      screen: SettingsScreen,
      options: { title: 'Settings', headerLargeTitleEnabled: true },
    }),
    SecuritySettingsScreen: createNativeStackScreen({
      screen: SecuritySettingsScreen,
      options: { title: 'Security', headerLargeTitleEnabled: true },
    }),
    ChangePINScreen: createNativeStackScreen({
      screen: ChangePINScreen,
      options: { title: 'Change PIN' },
    }),
    AppearanceSettingsScreen: createNativeStackScreen({
      screen: AppearanceSettingsScreen,
      options: { title: 'Appearance', headerLargeTitleEnabled: true },
    }),
    NotificationsSettingsScreen: createNativeStackScreen({
      screen: NotificationsSettingsScreen,
      options: { title: 'Notifications', headerLargeTitleEnabled: true },
    }),
    AboutSettingsScreen: createNativeStackScreen({
      screen: AboutSettingsScreen,
      options: { title: 'About', headerLargeTitleEnabled: true },
    }),
    DebugSettingsScreen: createNativeStackScreen({
      screen: DebugSettingsScreen,
      options: { title: 'Debug', headerLargeTitleEnabled: true },
    }),
    NotificationScreen: createNativeStackScreen({
      screen: NotificationScreen,
      options: { title: 'Notifications', headerLargeTitleEnabled: true },
    }),
    ExploreClinicsScreen: createNativeStackScreen({
      screen: ExploreClinicsScreen,
      options: { headerLargeTitleEnabled: true },
    }),
    ExploreOrgsScreen: createNativeStackScreen({
      screen: ExploreOrgsScreen,
      options: { headerLargeTitleEnabled: true },
    }),
  },
});

// ── Root Stack ────────────────────────────────────────────────────────────────

const RootStack = createNativeStackNavigator({
  screenOptions: { headerShown: false },
  screens: {
    Loading: createNativeStackScreen({
      screen: LoadingScreen,
      if: useIsAppLoading,
      options: { animation: 'none' },
    }),
    Onboarding: createNativeStackScreen({
      screen: OnboardingStack,
      if: useIsOnboarding,
    }),
    Auth: createNativeStackScreen({
      screen: AuthStack,
      if: useIsInAuthFlow,
    }),
    SetupPIN: createNativeStackScreen({
      screen: SetupPINStack,
      if: useIsSettingUpPIN,
    }),
    LockFlow: createNativeStackScreen({
      screen: LockStack,
      if: useIsLocked,
    }),
    Main: createNativeStackScreen({
      screen: MainStack,
      if: useIsUnlocked,
    }),
  },
});

export const Navigation = createStaticNavigation(RootStack);
