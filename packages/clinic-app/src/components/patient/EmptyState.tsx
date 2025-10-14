import React from "react";
import { View } from "react-native";

import ThemedText from "@components/ThemedText";
import { cn } from "@lib/utils";

interface EmptyStateProps {
  message: string;
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ message, className }) => {
  return (
    <View className={cn("rounded-xl bg-muted/10 dark:bg-muted-dark/10 px-4 py-3", className)}>
      <ThemedText className="text-text-secondary dark:text-text-secondary-dark">
        {message}
      </ThemedText>
    </View>
  );
};

EmptyState.displayName = "EmptyState";

export default EmptyState;
