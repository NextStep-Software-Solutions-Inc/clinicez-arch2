import React from "react";
import { View } from "react-native";

import ThemedText from "@components/ThemedText";
import Each from "@components/Each";
import EmptyState from "./EmptyState";
import PatientRecordCard from "./PatientRecordCard";
import { cn } from "@lib/utils";
import { formatToYYYYMMDD } from "@lib/date-format";
import { formatHealthcareProvider } from "@lib/healthcare-provider-format";
import type { PrescriptionHistory } from "@app-types/patient";

interface PrescriptionHistoryViewProps {
  prescriptions?: PrescriptionHistory[];
  className?: string;
}

const PrescriptionHistoryView: React.FC<PrescriptionHistoryViewProps> = ({ prescriptions, className }) => {
  if (!prescriptions || prescriptions.length === 0) {
    return <EmptyState message="No prescription records available." className={className} />;
  }

  return (
    <View className={cn("gap-3", className)}>
      <Each
        items={prescriptions}
        render={(prescription) => (
          <PatientRecordCard>
            <ThemedText className="text-base font-semibold text-text dark:text-text-dark mb-2">
              {prescription.medicationName} {prescription.dosage} - {prescription.frequency}
            </ThemedText>

            <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark">
              {formatToYYYYMMDD(prescription.createdAt)} - {formatHealthcareProvider(prescription.hp)}
            </ThemedText>
          </PatientRecordCard>
        )}
      />
    </View>
  );
};

PrescriptionHistoryView.displayName = "PrescriptionHistoryView";

export default PrescriptionHistoryView;
