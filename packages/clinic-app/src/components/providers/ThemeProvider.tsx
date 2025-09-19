// kylemicros was here *wink wink*
import React, { createContext } from "react";
import { useColorScheme } from "nativewind";
import { View } from "react-native";

/**
 * This is the central component in controlling the app's theme.
 * It uses NativeWind's `useColorScheme` hook to detect the current
 * color scheme (light or dark) and applies the corresponding
 * theme styles to the app.
 */

/**
 * It also provides a context to allow toggling the color scheme
 * from anywhere in the app.
 */

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeContext = createContext<{
  theme: "light" | "dark";
  toggleColorScheme: () => void;
}>({
  theme: "light",
  toggleColorScheme: () => { },
});

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const { colorScheme, toggleColorScheme } = useColorScheme();

  return (
    <ThemeContext.Provider value={{ theme: colorScheme || "light", toggleColorScheme }}>
      <View className="flex-1 bg-background">
        {children}
      </View>
    </ThemeContext.Provider>
  );
};