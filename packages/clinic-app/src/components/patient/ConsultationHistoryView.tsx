import React from "react";
import { View, Pressable } from "react-native";

import ThemedText from "@components/ThemedText";
import Each from "@components/Each";
import EmptyState from "./EmptyState";
import PatientRecordCard from "./PatientRecordCard";
import { cn } from "@lib/utils";
import { formatToReadable } from "@lib/date-format";
import { formatHealthcareProvider } from "@lib/healthcare-provider-format";
import type { ConsultationHistory } from "@app-types/patient";

interface ConsultationHistoryViewProps {
  consultations: ConsultationHistory[];
  className?: string;
  onViewDetails?: (consultation: ConsultationHistory) => void;
}

const ConsultationHistoryView: React.FC<ConsultationHistoryViewProps> = ({
  consultations,
  className,
  onViewDetails,
}) => {
  if (!consultations || consultations.length === 0) {
    return <EmptyState message="No consultation records available." className={className} />;
  }

  return (
    <View className={cn("gap-3", className)}>
      <Each
        items={consultations}
        render={(consultation) => (
          <PatientRecordCard>
            <ThemedText className="text-base font-semibold text-text dark:text-text-dark mb-2">
              {formatToReadable(consultation.createdAt)} - {consultation.diagnosis.name}
            </ThemedText>

            <View className="flex-row items-start gap-1 mb-3">
              <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark flex-1">
                {formatHealthcareProvider(consultation.hp, true)}
                {" • "}
                <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark">
                  Chief Complaint: {consultation.chiefComplaint}
                </ThemedText>
              </ThemedText>
            </View>

            {onViewDetails && (
              <Pressable
                onPress={() => onViewDetails(consultation)}
                className="self-start px-4 py-2 rounded-lg bg-primary/10 dark:bg-primary-dark/10 active:opacity-70"
              >
                <ThemedText className="text-sm font-medium text-primary dark:text-primary-dark">
                  View
                </ThemedText>
              </Pressable>
            )}
          </PatientRecordCard>
        )}
      />
    </View>
  );
};

ConsultationHistoryView.displayName = "ConsultationHistoryView";

export default ConsultationHistoryView;
