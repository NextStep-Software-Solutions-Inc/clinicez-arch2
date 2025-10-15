import React from "react";
import { View } from "react-native";
import ThemedText from "@components/ThemedText";
import ThemedButton from "@components/ThemedButton";

type CalendarHeaderProps = {
  currentMonth: string;
  onSchedulePress: () => void;
};

export const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  currentMonth,
  onSchedulePress,
}) => {
  return (
    <View className="px-6 pt-4 pb-3 bg-background dark:bg-background-dark">
      <View className="flex-row items-center justify-between">
        <ThemedText variant="header" className="text-2xl font-bold" color="text">
          {currentMonth}
        </ThemedText>
        <ThemedButton
          variant="default"
          size="sm"
          leftIcon="calendar-plus"
          onPress={onSchedulePress}
        >
          Schedule
        </ThemedButton>
      </View>
    </View>
  );
};
