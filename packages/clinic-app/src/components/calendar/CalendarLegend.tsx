import React from "react";
import { View } from "react-native";
import ThemedText from "@components/ThemedText";
import { getThemeColor } from "@theme/colors";
import { useColorScheme } from "nativewind";

type LegendItem = {
  color: string;
  label: string;
};

export const CalendarLegend: React.FC = () => {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const legendItems: LegendItem[] = [
    {
      color: getThemeColor("pastelGreen", isDark ? "dark" : "light"),
      label: "Fully Booked",
    },
    {
      color: getThemeColor("pastelPink", isDark ? "dark" : "light"),
      label: "Unavailable",
    },
    {
      color: getThemeColor("lightGray", isDark ? "dark" : "light"),
      label: "No Bookings",
    },
  ];

  return (
    <View
      className="bg-background dark:bg-background-dark border-t border-border dark:border-border-dark"
    >
      <View className="flex-row justify-center items-center gap-6 py-3 px-6">
        {legendItems.map((item) => (
          <View key={item.label} className="flex-row items-center">
            <View
              className="w-4 h-4 rounded mr-2"
              style={{ backgroundColor: item.color }}
            />
            <ThemedText variant="caption">{item.label}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
};
