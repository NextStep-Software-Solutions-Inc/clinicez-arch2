import React from "react";
import { View } from "react-native";

import ThemedText from "@components/ThemedText";
import Each from "@components/Each";
import EmptyState from "./EmptyState";
import PatientRecordCard from "./PatientRecordCard";
import { cn } from "@lib/utils";
import { formatToYYYYMMDD } from "@lib/date-format";
import { formatHealthcareProvider } from "@lib/healthcare-provider-format";
import type { DiagnosisHistory } from "@app-types/patient";

interface DiagnosisHistoryViewProps {
  diagnoses: DiagnosisHistory[];
  className?: string;
}

const DiagnosisHistoryView: React.FC<DiagnosisHistoryViewProps> = ({ diagnoses, className }) => {
  if (!diagnoses || diagnoses.length === 0) {
    return <EmptyState message="No diagnosis records available." className={className} />;
  }

  return (
    <View className={cn("gap-3", className)}>
      <Each
        items={diagnoses}
        render={(diagnosisRecord) => (
          <PatientRecordCard>
            <ThemedText className="text-base font-semibold text-text dark:text-text-dark mb-2">
              {diagnosisRecord.diagnosis.code && `${diagnosisRecord.diagnosis.code} - `}
              {diagnosisRecord.diagnosis.name}
            </ThemedText>

            <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark">
              {formatToYYYYMMDD(diagnosisRecord.createdAt)} - {formatHealthcareProvider(diagnosisRecord.hp)}
            </ThemedText>
          </PatientRecordCard>
        )}
      />
    </View>
  );
};

DiagnosisHistoryView.displayName = "DiagnosisHistoryView";

export default DiagnosisHistoryView;
