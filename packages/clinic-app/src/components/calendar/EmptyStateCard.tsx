import React from "react";
import { Card, CardContent } from "@components/ThemedCard";
import ThemedText from "@components/ThemedText";
import ThemedButton from "@components/ThemedButton";

type EmptyStateCardProps = {
  type: "unavailable" | "noBookings";
  date: string;
  onAction: () => void;
};

export const EmptyStateCard: React.FC<EmptyStateCardProps> = ({
  type,
  date,
  onAction,
}) => {
  const config = {
    unavailable: {
      title: "Unavailable for this day",
      titleColor: "text-error dark:text-error-dark",
      buttonText: "Available",
      buttonVariant: "default" as const,
    },
    noBookings: {
      title: "No bookings for this day",
      titleColor: "text-muted dark:text-muted-dark",
      buttonText: "Unavailable",
      buttonVariant: "destructive" as const,
    },
  };

  const { title, titleColor, buttonText, buttonVariant } = config[type];

  return (
    <Card>
      <CardContent className="items-center py-6 gap-3">
        <ThemedText className={`font-medium ${titleColor}`}>
          {title}
        </ThemedText>
        <ThemedText className="text-lg text-text dark:text-text-dark">
          {date}
        </ThemedText>
        <ThemedButton
          variant={buttonVariant}
          size="default"
          onPress={onAction}
          className="mt-2"
        >
          {buttonText}
        </ThemedButton>
      </CardContent>
    </Card>
  );
};
