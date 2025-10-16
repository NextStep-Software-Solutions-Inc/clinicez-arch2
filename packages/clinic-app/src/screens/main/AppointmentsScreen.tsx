import React, { useMemo, useState } from "react";
import { View } from "react-native";

import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "@components/ThemedView";
import { ThemedInput } from "@components/ThemedInput";
import ButtonGroup from "@components/ui/ButtonGroup";
import AppointmentList from "@components/appointment/AppointmentList";
import { mockAppointmentsData } from "@data/appointments";
import { AppointmentData, AppointmentStatus } from "@app-types/appointment";
import ThemedIcon from "@components/ThemedIcon";

type FilterType = "All" | AppointmentStatus;

const AppointmentsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const bottomSpacing = Math.max(tabBarHeight - insets.bottom - 4, 0);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<FilterType>("All");

  const filteredAppointments = useMemo(() => {
    let filtered = mockAppointmentsData;

    if (selectedFilter !== "All") {
      filtered = filtered.filter((apt) => apt.status === selectedFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((apt) =>
        `${apt.patient.name.firstName} ${apt.patient.name.lastName}`
          .toLowerCase()
          .includes(query) ||
        apt.chiefComplaint.name.toLowerCase().includes(query) ||
        apt.service.name.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [searchQuery, selectedFilter]);

  const appointmentCounts = useMemo(() => {
    return {
      all: mockAppointmentsData.length,
      pending: mockAppointmentsData.filter((a) => a.status === "Pending").length,
      accepted: mockAppointmentsData.filter((a) => a.status === "Accepted").length,
      rejected: mockAppointmentsData.filter((a) => a.status === "Rejected").length,
      completed: mockAppointmentsData.filter((a) => a.status === "Completed").length,
    };
  }, []);

  const filterOptions = [
    { value: "All" as FilterType, label: "All", count: appointmentCounts.all },
    { value: "Pending" as FilterType, label: "Pending", count: appointmentCounts.pending },
    { value: "Accepted" as FilterType, label: "Accepted", count: appointmentCounts.accepted },
    { value: "Rejected" as FilterType, label: "Rejected", count: appointmentCounts.rejected },
    { value: "Completed" as FilterType, label: "Completed", count: appointmentCounts.completed },
  ];

  const handleReceiveAppointment = (appointment: AppointmentData) => {
    console.log("Receive appointment:", appointment.id);
  };

  const handleRejectAppointment = (appointment: AppointmentData) => {
    console.log("Reject appointment:", appointment.id);
  };

  const handleRescheduleAppointment = (appointment: AppointmentData) => {
    console.log("Reschedule appointment:", appointment.id);
  };

  const handleAppointmentPress = (appointment: AppointmentData) => {
    console.log("View appointment details:", appointment.id);
  };

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <ThemedView variant="transparent" className="flex-1 px-4">
        <View className="gap-4 mb-4">
          <ThemedInput
            placeholder="Search appointments..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="rounded-full"
            leftIcon={
              <ThemedIcon
                icon="search"
                size="default"
                className="text-muted dark:text-muted-dark"
              />
            }
          />
          <ButtonGroup
            options={filterOptions}
            value={selectedFilter}
            onValueChange={setSelectedFilter}
            variant="filled"
            size="sm"
          />
        </View>

        <AppointmentList
          data={filteredAppointments}
          onAppointmentPress={handleAppointmentPress}
          onReceivePress={handleReceiveAppointment}
          onRejectPress={handleRejectAppointment}
          onReschedulePress={handleRescheduleAppointment}
          contentContainerStyle={{ paddingBottom: bottomSpacing }}
        />
      </ThemedView>
    </View>
  );
};

AppointmentsScreen.displayName = "AppointmentsScreen";

export default AppointmentsScreen;
