import React from "react";
import { View } from "react-native";

import ThemedText from "@components/ThemedText";
import Each from "@components/Each";
import EmptyState from "./EmptyState";
import PatientRecordCard from "./PatientRecordCard";
import { cn } from "@lib/utils";
import { formatToYYYYMMDD } from "@lib/date-format";
import type { VaccinationRecord } from "@app-types/patient";

interface VaccinationRecordsViewProps {
  vaccinations?: VaccinationRecord[];
  className?: string;
}

const VaccinationRecordsView: React.FC<VaccinationRecordsViewProps> = ({ vaccinations, className }) => {
  if (!vaccinations || vaccinations.length === 0) {
    return <EmptyState message="No vaccination records available." className={className} />;
  }

  return (
    <View className={cn("gap-3", className)}>
      <Each
        items={vaccinations}
        render={(vaccination) => (
          <PatientRecordCard>
            <ThemedText className="text-base font-semibold text-text dark:text-text-dark mb-2">
              {vaccination.vaccineName}
              {vaccination.doseNumber && ` - ${vaccination.doseNumber}`}
            </ThemedText>

            <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark">
              {formatToYYYYMMDD(vaccination.dateAdministered)}
            </ThemedText>
          </PatientRecordCard>
        )}
      />
    </View>
  );
};

VaccinationRecordsView.displayName = "VaccinationRecordsView";

export default VaccinationRecordsView;
