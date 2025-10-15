import React from "react";
import { View } from "react-native";
import { Card, CardHeader, CardContent, CardFooter } from "@components/ThemedCard";
import ThemedText from "@components/ThemedText";
import ThemedIcon from "@components/ThemedIcon";
import ThemedButton from "@components/ThemedButton";
import { getThemeColor } from "@theme/colors";
import { useColorScheme } from "nativewind";
import type { Appointment } from "../../types/calendar";

type AppointmentCardProps = {
  appointment: Appointment;
  onStartConsultation: (id: string) => void;
};

const AppointmentBadge: React.FC<{ text: string; color: string }> = ({ text, color }) => (
  <View
    className="px-2.5 py-0.5 rounded-full border"
    style={{ borderColor: color, backgroundColor: 'transparent' }}
  >
    <ThemedText className="text-xs" style={{ color }}>
      {text}
    </ThemedText>
  </View>
);

export const AppointmentCard: React.FC<AppointmentCardProps> = ({
  appointment,
  onStartConsultation,
}) => {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const serviceColor = getThemeColor("orange", isDark ? "dark" : "light");
  const modeColor = getThemeColor("pink", isDark ? "dark" : "light");

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2 flex-wrap">
          <ThemedText variant="label" className="font-semibold text-text dark:text-text-dark">
            {appointment.patientName}
          </ThemedText>
          <AppointmentBadge text={appointment.service} color={serviceColor} />
          <AppointmentBadge text={appointment.mode} color={modeColor} />
        </View>
      </CardHeader>

      <CardContent className="gap-3">
        <View className="flex-row items-center gap-2">
          <ThemedIcon icon="clock" size="sm" />
          <ThemedText className="text-sm text-text dark:text-text-dark">
            Duration:{" "}
            <ThemedText className="text-sm font-bold text-text dark:text-text-dark">
              {appointment.duration}
            </ThemedText>
          </ThemedText>
        </View>
        <View className="flex-row items-center gap-2">
          <ThemedIcon icon="calendar" size="sm" />
          <ThemedText className="text-sm text-text dark:text-text-dark">
            Time:{" "}
            <ThemedText className="text-sm font-bold text-text dark:text-text-dark">
              {appointment.timeRange}
            </ThemedText>
          </ThemedText>
        </View>
      </CardContent>

      <CardFooter>
        <ThemedButton
          variant="default"
          size="sm"
          className="flex-1"
          onPress={() => onStartConsultation(appointment.id)}
        >
          Start Consultation
        </ThemedButton>
      </CardFooter>
    </Card>
  );
};
