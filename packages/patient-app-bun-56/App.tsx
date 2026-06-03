import { StatusBar } from 'expo-status-bar';
import { Navigation } from './navigation/Navigation';
import { DefaultTheme, DarkTheme, MaterialDarkTheme, MaterialLightTheme, Theme } from "@react-navigation/native";
import { Platform, useColorScheme } from 'react-native';
import { AuthProvider } from 'contexts/AuthContext';
import { OnboardingProvider } from 'contexts/OnboardingContext';

export default function App() {
  const theme = useColorScheme();
  const isDarkMode = theme === 'dark';
  
  const selectedTheme = Platform.select<Theme>({
  ios: isDarkMode ? DarkTheme : DefaultTheme,
  android: isDarkMode ? MaterialDarkTheme : MaterialLightTheme,
}) ?? DefaultTheme;

  return (
    <OnboardingProvider>
      <AuthProvider>
      <StatusBar style="auto" />
      <Navigation theme={selectedTheme}/>
    </AuthProvider>
    </OnboardingProvider>
  );
}
