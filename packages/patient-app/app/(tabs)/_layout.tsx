import { router, Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

import { Feather } from '@expo/vector-icons';
import { GlobalHeader } from '@/components/GlobalHeader';
import JoinClinicScreen from '@/screens/onboarding/JoinClinicScreen';
import { useClinicContext } from '@/components/ClinicContext';
import { useClerk } from '@clerk/clerk-expo';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { isSignedIn } = useClerk();
  const { currentClinicId, setCurrentClinicId } = useClinicContext();

  if (!isSignedIn) {
    router.replace('/(auth)/sign-in');
    return null;
  }

  if (!currentClinicId) {
    return (
      <JoinClinicScreen
        onJoin={(clinicId) => {
          setCurrentClinicId(clinicId);
        }}
        onBack={() => {
          // Handle back navigation if needed
        }}
        onExit={() => {
          // Handle exit action, e.g., redirect to home or sign-in
        }}
      />
    );
  }


  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: true,
        header: () => (
          <GlobalHeader />
        ),
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            // Use a transparent background on iOS to show the blur effect
            // position: 'absolute',
            backgroundColor: Colors[colorScheme ?? 'light'].background,
          },
          default: {
            backgroundColor: Colors[colorScheme ?? 'light'].background,
          },
        }),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <Feather size={28} name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{
          tabBarLabel: 'Appointments',
          tabBarIcon: ({ color }) => <Feather size={28} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="health"
        options={{
          tabBarLabel: 'Health',
          tabBarIcon: ({ color }) => <Feather size={28} name="heart" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => <Feather size={28} name="user" color={color} />,
        }}
      />
    </Tabs>
  );
}
