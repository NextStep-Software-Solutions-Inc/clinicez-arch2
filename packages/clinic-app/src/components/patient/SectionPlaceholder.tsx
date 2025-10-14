import React from "react";
import { View } from "react-native";

import ThemedText from "@components/ThemedText";
import { cn } from "@lib/utils";

interface SectionPlaceholderProps {
  message?: string;
  className?: string;
}

const SectionPlaceholder: React.FC<SectionPlaceholderProps> = ({
  message = "This section is under development. Please check back later.",
  className,
}) => {
  return (
    <View className={cn("rounded-xl bg-muted/10 dark:bg-muted-dark/10 px-4 py-3", className)}>
      <ThemedText className="text-text-secondary dark:text-text-secondary-dark">
        {message}
      </ThemedText>
    </View>
  );
};

SectionPlaceholder.displayName = "SectionPlaceholder";

export default SectionPlaceholder;
