import React from "react";
import { View, ScrollView } from "react-native";
import { AppointmentCard } from "./AppointmentCard";
import { EmptyStateCard } from "./EmptyStateCard";
import type { DayData } from "../../types/calendar";

type EventDisplayProps = {
  dayData: DayData;
  selectedDate: string;
  onStartConsultation: (id: string) => void;
  onMakeAvailable: () => void;
  onMakeUnavailable: () => void;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export const EventDisplay: React.FC<EventDisplayProps> = ({
  dayData,
  selectedDate,
  onStartConsultation,
  onMakeAvailable,
  onMakeUnavailable,
}) => {
  const formattedDate = formatDate(selectedDate);

  return (
    <ScrollView className="flex-1 px-6 py-4" showsVerticalScrollIndicator={false}>
      {dayData.status === "fullyBooked" && dayData.appointments && (
        <View className="gap-4">
          {dayData.appointments.map((appointment) => (
            <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              onStartConsultation={onStartConsultation}
            />
          ))}
        </View>
      )}

      {dayData.status === "unavailable" && (
        <EmptyStateCard
          type="unavailable"
          date={formattedDate}
          onAction={onMakeAvailable}
        />
      )}

      {dayData.status === "noBookings" && (
        <EmptyStateCard
          type="noBookings"
          date={formattedDate}
          onAction={onMakeUnavailable}
        />
      )}
    </ScrollView>
  );
};
