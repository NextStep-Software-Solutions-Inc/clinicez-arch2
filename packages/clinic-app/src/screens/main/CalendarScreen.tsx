import React from "react";
import { View } from "react-native";


import ThemedIcon from "@components/ThemedIcon";
import ThemedText from "@components/ThemedText";
import ThemedView from "@components/ThemedView";
import Spacer from "@components/ui/Spacer";

const WEEK_DAYS = [
  { key: "mon", label: "Mon", date: "15", status: "busy" },
  { key: "tue", label: "Tue", date: "16", status: "available" },
  { key: "wed", label: "Wed", date: "17", status: "partial" },
  { key: "thu", label: "Thu", date: "18", status: "available" },
  { key: "fri", label: "Fri", date: "19", status: "busy" },
];

const STATUS_STYLES: Record<string, string> = {
  busy: "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300",
  available: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300",
  partial: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300",
};

const CalendarScreen: React.FC = () => {

  return (
    <View
      style={{
        paddingTop: 16,
        paddingBottom: 16,
      }}
      className="flex-1 bg-background dark:bg-background-dark"
    >
      <ThemedView variant="transparent" className="flex-1 px-6">
        <View className="flex-row justify-between mb-8">
          {WEEK_DAYS.map((day) => (
            <View
              key={day.key}
              className="items-center px-3 py-4 rounded-xl border border-border dark:border-border-dark bg-background/90 dark:bg-background-dark/70"
            >
              <ThemedText variant="caption" className="text-muted dark:text-muted-dark">
                {day.label}
              </ThemedText>
              <Spacer size={6} />
              <ThemedText variant="label" className="text-lg font-semibold">
                {day.date}
              </ThemedText>
              <Spacer size={8} />
              <View className={`px-2 py-1 rounded-full ${STATUS_STYLES[day.status]}`}>
                <ThemedText variant="caption" className="text-xs font-medium">
                  {day.status === "partial" ? "Partial" : day.status === "busy" ? "Busy" : "Open"}
                </ThemedText>
              </View>
            </View>
          ))}
        </View>

        <View className="rounded-2xl bg-primary/10 dark:bg-primary/20 border border-primary/30 dark:border-primary/40 p-6">
          <View className="flex-row items-center">
            <ThemedIcon icon="calendar-plus" color="primary" size="lg" className="mr-4" />
            <View className="flex-1">
              <ThemedText variant="label" className="font-semibold">
                Need to add a new event?
              </ThemedText>
              <ThemedText variant="caption" className="text-muted dark:text-muted-dark mt-2">
                Tap the plus icon in the bottom navigation to schedule procedures, blockers, or reminders.
              </ThemedText>
            </View>
          </View>
        </View>
      </ThemedView>
    </View>
  );
};

CalendarScreen.displayName = "CalendarScreen";

export default CalendarScreen;
