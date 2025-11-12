import React from "react";
import { View } from "react-native";

import ThemedText from "@components/ThemedText";
import Each from "@components/Each";
import { cn } from "@lib/utils";
import type { Disability } from "@app-types/patient";
import EmptyState from "./EmptyState";
import PatientRecordCard from "./PatientRecordCard";
import { formatToYYYYMMDD } from "@lib/date-format";

interface DisabilitiesViewProps {
  disabilities?: Disability[];
  className?: string;
}

const DisabilitiesView: React.FC<DisabilitiesViewProps> = ({ disabilities, className }) => {
  if (!disabilities || disabilities.length === 0) {
    return <EmptyState message="No disabilities recorded." className={className} />;
  }

  return (
    <View className={cn("gap-3", className)}>
      <Each
        items={disabilities}
        render={(disability) => (
          <PatientRecordCard>
            <ThemedText className="text-base font-semibold text-text dark:text-text-dark mb-2">
              {disability.type}
            </ThemedText>

            {disability.description && (
              <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark">
                {disability.description}
              </ThemedText>
            )}
          </PatientRecordCard>
        )}
      />
    </View>
  );
};

DisabilitiesView.displayName = "DisabilitiesView";

export default DisabilitiesView;
