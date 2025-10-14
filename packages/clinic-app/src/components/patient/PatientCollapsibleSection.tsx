import React, { ReactNode } from "react";
import { View } from "react-native";

import { Card } from "@components/ThemedCard";
import ThemedIcon from "@components/ThemedIcon";
import ThemedText from "@components/ThemedText";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@components/ui/Collapsible";
import { cn } from "@lib/utils";
import type { IconName } from "@components/ThemedIcon";

export interface PatientCollapsibleSectionProps {
  title: string;
  icon: IconName;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}

const PatientCollapsibleSection: React.FC<PatientCollapsibleSectionProps> = ({
  title,
  icon,
  children,
  className,
  defaultOpen = false,
}) => {
  return (
    <Card className={cn("shadow-none bg-base dark:bg-surface-elevated-dark overflow-hidden", className)}>
      <Collapsible defaultOpen={defaultOpen}>
        <CollapsibleTrigger className="w-full px-6 py-4 gap-2">
          <ThemedIcon icon={icon} color="text" size="sm" />
          <ThemedText variant="subheader" className="flex-1 text-left text-lg font-semibold text-text dark:text-text-dark">
            {title}
          </ThemedText>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <View className="px-6 pb-6 pt-4 border-t border-border dark:border-border-dark">
            {children}
          </View>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

PatientCollapsibleSection.displayName = "PatientCollapsibleSection";

export default PatientCollapsibleSection;
