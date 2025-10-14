import React from "react";
import { View } from "react-native";

import ThemedText from "@components/ThemedText";
import Each from "@components/Each";
import EmptyState from "./EmptyState";
import PatientRecordCard from "./PatientRecordCard";
import { cn } from "@lib/utils";
import type { FamilyHistory } from "@app-types/patient";

interface FamilyHistoryViewProps {
  familyHistory: FamilyHistory[];
  className?: string;
}

const FamilyHistoryView: React.FC<FamilyHistoryViewProps> = ({ familyHistory, className }) => {
  if (!familyHistory || familyHistory.length === 0) {
    return <EmptyState message="No family history records available." className={className} />;
  }

  return (
    <View className={cn("gap-3", className)}>
      <Each
        items={familyHistory}
        render={(item) => (
          <PatientRecordCard>
            <ThemedText className="text-base font-semibold text-text dark:text-text-dark mb-2">
              {item.condition}
            </ThemedText>

            <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark">
              {item.relation}
            </ThemedText>

            {item.notes && (
              <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark mt-2">
                Note: {item.notes}
              </ThemedText>
            )}
          </PatientRecordCard>
        )}
      />
    </View>
  );
};

FamilyHistoryView.displayName = "FamilyHistoryView";

export default FamilyHistoryView;
