import React from "react";
import { FlatList, Pressable, View } from "react-native";

import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedIcon from "@components/ThemedIcon";
import ThemedText from "@components/ThemedText";
import ThemedView from "@components/ThemedView";
import Spacer from "@components/ui/Spacer";

const APPOINTMENTS = [
  {
    id: "appt-1",
    patient: "Maria Santos",
    time: "09:30 AM",
    type: "Initial Consultation",
    room: "Room 204",
  },
  {
    id: "appt-2",
    patient: "James Lee",
    time: "11:00 AM",
    type: "Follow-up",
    room: "Room 112",
  },
  {
    id: "appt-3",
    patient: "Olivia Chen",
    time: "02:15 PM",
    type: "Annual Checkup",
    room: "Room 315",
  },
  {
    id: "appt-4",
    patient: "Liam Johnson",
    time: "03:45 PM",
    type: "Physical Therapy",
    room: "Room 101",
  },
  {
    id: "appt-5",
    patient: "Sophia Martinez",
    time: "04:30 PM",
    type: "Dermatology Consultation",
    room: "Room 220",
  },
  {
    id: "appt-6",
    patient: "Ethan Brown",
    time: "05:15 PM",
    type: "Cardiology Follow-up",
    room: "Room 330",
  },
  {
    id: "appt-7",
    patient: "Ava Wilson",
    time: "06:00 PM",
    type: "Pediatric Checkup",
    room: "Room 150",
  },
  {
    id: "appt-8",
    patient: "Mia Thompson",
    time: "07:30 PM",
    type: "Nutrition Consultation",
    room: "Room 250",
  }
];

const AppointmentsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const bottomSpacing = Math.max(tabBarHeight - insets.bottom - 4, 0);

  return (
    <View
      style={{
        paddingTop: 16,
        paddingBottom: 0,
      }}
      className="flex-1 bg-background dark:bg-background-dark"
    >
      <ThemedView variant="transparent" className="flex-1 px-6">
        <FlatList
          data={APPOINTMENTS}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable className="mb-4 rounded-2xl border border-border dark:border-border-dark bg-background/90 dark:bg-background-dark/70 p-4">
              <View className="flex-row items-center justify-between">
                <View>
                  <ThemedText variant="label" className="font-semibold">
                    {item.patient}
                  </ThemedText>
                  <ThemedText variant="caption" className="text-muted dark:text-muted-dark">
                    {item.type}
                  </ThemedText>
                </View>
                <View className="items-end">
                  <View className="flex-row items-center">
                    <ThemedIcon icon="clock" color="info" size="sm" className="mr-2" />
                    <ThemedText variant="caption" className="text-muted dark:text-muted-dark">
                      {item.time}
                    </ThemedText>
                  </View>
                  <Spacer size={6} />
                  <View className="flex-row items-center">
                    <ThemedIcon icon="map-pin" color="muted" size="sm" className="mr-2" />
                    <ThemedText variant="caption" className="text-muted dark:text-muted-dark">
                      {item.room}
                    </ThemedText>
                  </View>
                </View>
              </View>
            </Pressable>
          )}
          ListFooterComponent={null}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: bottomSpacing }}
        />
      </ThemedView>
    </View>
  );
};

AppointmentsScreen.displayName = "AppointmentsScreen";

export default AppointmentsScreen;
