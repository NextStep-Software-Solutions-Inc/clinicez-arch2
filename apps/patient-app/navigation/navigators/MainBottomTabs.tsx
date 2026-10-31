import { createBottomTabNavigator, createBottomTabScreen } from '@react-navigation/bottom-tabs';
import { ColorValue, Platform } from 'react-native';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppIcon, type IconName } from '../../components/ui/Icon';

import HomeStack from './HomeStack';
import AppointmentsStack from './AppointmentsStack';
import MessagesStack from './MessagesStack';
import FilesStack from './FilesStack';
import ProfileStack from './ProfileStack';

interface TabDefinition {
  title: string;
  screen: Parameters<typeof createBottomTabScreen>[0]['screen'];
  androidSymbol: 'home' | 'favorite' | 'chat_bubble' | 'description' | 'person';
  iosSymbol: 'house.fill' | 'heart.fill' | 'bubble.left.and.bubble.right.fill' | 'doc.fill' | 'person.fill';
  webIcon: IconName;
}

const TAB_DEFINITIONS = {
  HomeScreen: {
    title: 'Home',
    screen: HomeStack,
    androidSymbol: 'home',
    iosSymbol: 'house.fill',
    webIcon: 'home',
  },
  AppointmentsScreen: {
    title: 'My Appointments',
    screen: AppointmentsStack,
    androidSymbol: 'favorite',
    iosSymbol: 'heart.fill',
    webIcon: 'appointments',
  },
  MessagesScreen: {
    title: 'Messages',
    screen: MessagesStack,
    androidSymbol: 'chat_bubble',
    iosSymbol: 'bubble.left.and.bubble.right.fill',
    webIcon: 'chat',
  },
  RecordsScreen: {
    title: 'Records',
    screen: FilesStack,
    androidSymbol: 'description',
    iosSymbol: 'doc.fill',
    webIcon: 'files',
  },
  ProfileScreen: {
    title: 'My Profile',
    screen: ProfileStack,
    androidSymbol: 'person',
    iosSymbol: 'person.fill',
    webIcon: 'profile',
  },
} as const satisfies Record<string, TabDefinition>;

type TabScreenKey = keyof typeof TAB_DEFINITIONS;

const resolveTabIcon = (tab: TabDefinition) => {
  if (Platform.OS === 'ios') {
    return {
      type: 'sfSymbol' as const,
      name: tab.iosSymbol,
    };
  }

  if (Platform.OS === 'android') {
    return {
      type: 'materialSymbol' as const,
      name: tab.androidSymbol,
      variant: 'rounded' as const,
    };
  }

  return ({ color, size }: { color: ColorValue; size: number }) => (
    <AppIcon name={tab.webIcon} color={color} size={size} />
  );
};

const createScreen = (key: TabScreenKey) => {
  const tab = TAB_DEFINITIONS[key];
  return createBottomTabScreen({
    screen: tab.screen,
    options: ({ route }) => {
      const state = (route as any).state as { index?: number; routes?: Array<{ name: string }> } | undefined;
      const activeIdx = state?.index ?? (state?.routes ? state.routes.length - 1 : 0);
      const childRoute = state?.routes?.[activeIdx]?.name;
      const isViewer = childRoute === 'FileViewerScreen';
      return {
        title: tab.title,
        tabBarIcon: resolveTabIcon(tab),
        tabBarStyle: isViewer ? { display: 'none' } : undefined,
      };
    },
  });
};

const MainBottomTabs = createBottomTabNavigator({
  // Native implementation delivers:
  // - Android: 100% native Material 3 BottomNavigationView with active pill indicator & ripple
  // - iOS: 100% native UITabBar with SF Symbols & Liquid Glass translucency
  // - Web: JavaScript tab bar with crisp Lucide icons
  screenOptions: ({ theme }) => ({
    animation: 'shift',
    tabBarActiveTintColor: theme.colors.primary,
    tabBarActiveIndicatorColor:
      typeof theme.colors.primary === 'string' ? `${theme.colors.primary}26` : undefined,
    tabBarStyle: {
      backgroundColor: isLiquidGlassSupported && Platform.OS === 'ios' ? 'transparent' : undefined,
    },
  }),
  screens: {
    HomeScreen: createScreen('HomeScreen'),
    AppointmentsScreen: createScreen('AppointmentsScreen'),
    MessagesScreen: createScreen('MessagesScreen'),
    RecordsScreen: createScreen('RecordsScreen'),
    ProfileScreen: createScreen('ProfileScreen'),
  },
});

export default MainBottomTabs;
