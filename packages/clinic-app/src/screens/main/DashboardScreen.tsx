import React from "react";
import { ScrollView, useColorScheme, View } from "react-native";
import { useUser } from "@clerk/clerk-expo";

import ThemedCard from "@components/ThemedCard";
import ThemedIcon from "@components/ThemedIcon";
import ThemedText from "@components/ThemedText";
import ThemedView from "@components/ThemedView";
import ThemedButton from "@components/ThemedButton";
import AnalyticsCard, { AnalyticsCardProps } from "@components/AnalyticsCard";
import AppointmentsToday from "@components/dashboard/AppointmentsToday";

const analyticsData: AnalyticsCardProps["analytics"] = [
  {
    header: "Appointments Today",
    icon: "calendar",
    body: "24",
    sub: "23 Pending",
    percentageValue: "8.5",
    trend: "up",
  },
  {
    header: "Pending Appointments",
    icon: "clock",
    body: "5",
    sub: "2 Urgent",
    percentageValue: "5.2",
    trend: "down",
  },
  {
    header: "Total Patients",
    icon: "users",
    body: "1,204",
    sub: "Active Patients",
    percentageValue: "3.1",
    trend: "up",
  },
];

const DashboardScreen: React.FC = () => {
  const { user } = useUser();
  const colorScheme = useColorScheme();

  const nextAppointment = {
    patient: "Maria Santos",
    time: "3:00 PM",
    service: "Comprehensive Checkup",
  } as const;

  const patientInitial = nextAppointment.patient.charAt(0).toUpperCase();

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      className="flex-1 bg-background dark:bg-background-dark">
      <ThemedView variant="transparent" className="flex-1 px-6">
        <View className="w-full mx-auto py-4">
          <ThemedText variant="label" className="text-sm text-muted-foreground dark:text-muted-foreground-dark">
            Welcome back, {user?.firstName ?? user?.fullName ?? "Clinician"}
          </ThemedText>
          <ThemedText variant="header" className="mt-1 text-3xl font-semibold text-text dark:text-text-dark">
            Today&apos;s Overview
          </ThemedText>

          <ThemedCard className="mt-2 shadow-sm dark:shadow-none bg-primary dark:border-border-dark dark:bg-surface-elevated-dark">
            <ThemedCard.Header className="flex-row items-center justify-between gap-3 pt-5 pb-3">
              <ThemedCard.Title className="text-primary-soft dark:text-primary-dark">
                Upcoming Appointment
              </ThemedCard.Title>
              <ThemedIcon icon="clipboard-clock" color={colorScheme === "dark" ? "info" : "primarySoft"} />
            </ThemedCard.Header>
            <ThemedCard.Content>
              <View className="flex-row items-center">
                <View className="mr-4 h-12 w-12 items-center justify-center rounded-full border border-primary-soft dark:border-accent-dark dark:bg-accent-dark">
                  <ThemedText variant="label" className="text-lg text-primary-soft dark:text-primary-dark">
                    {patientInitial}
                  </ThemedText>
                </View>
                <View className="flex-1">
                  <ThemedText variant="label" className="text-lg text-primary-foreground dark:text-text-dark">
                    {nextAppointment.patient}
                  </ThemedText>
                  <ThemedText variant="caption" className="mt-1 text-primary-foreground dark:text-muted-dark">
                    {`${nextAppointment.time} - ${nextAppointment.service}`}
                  </ThemedText>
                </View>
              </View>
            </ThemedCard.Content>
            <ThemedCard.Footer>
              <ThemedButton
                leftIcon="command"
                leftIconColor="primary"
                size="sm"
                className="rounded-full border border-primary-soft dark:border-primary-dark bg-background dark:bg-transparent"
              >
                <ThemedText
                  className="text-primary dark:text-primary-dark"
                  variant="button"
                >
                  View Details
                </ThemedText>
              </ThemedButton>
            </ThemedCard.Footer>
          </ThemedCard>

          <AnalyticsCard
            analytics={analyticsData}
            className="bg-background/90 dark:bg-background-dark/70 border border-border dark:border-border-dark"
          />
          <AppointmentsToday appointments={[]} />
        </View>
      </ThemedView>
    </ScrollView>
  );
};

DashboardScreen.displayName = "DashboardScreen";

export default DashboardScreen;
