import React from "react";
import { View } from "react-native";

import ThemedText from "@components/ThemedText";
import Each from "@components/Each";
import EmptyState from "./EmptyState";
import PatientRecordCard from "./PatientRecordCard";
import { cn } from "@lib/utils";
import { formatToYYYYMMDD } from "@lib/date-format";
import type { VitalRecord } from "@app-types/patient";

interface VitalsHistoryViewProps {
  vitals: VitalRecord[];
  className?: string;
}

const VitalsHistoryView: React.FC<VitalsHistoryViewProps> = ({ vitals, className }) => {
  if (!vitals || vitals.length === 0) {
    return <EmptyState message="No vital sign records available." className={className} />;
  }

  return (
    <View className={cn("gap-3", className)}>
      <Each
        items={vitals}
        render={(vital) => (
          <PatientRecordCard>
            <View className="flex-row justify-between items-center mb-3">
              <ThemedText className="text-sm font-semibold text-text dark:text-text-dark">
                {formatToYYYYMMDD(vital.createdAt)}
              </ThemedText>
            </View>
            <View className="gap-2">
              <View className="flex-row justify-between">
                <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark">
                  Temperature:
                </ThemedText>
                <ThemedText className="text-sm font-medium text-text dark:text-text-dark">
                  {vital.temperature.toFixed(1)}°C
                </ThemedText>
              </View>
              <View className="flex-row justify-between">
                <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark">
                  Blood Pressure:
                </ThemedText>
                <ThemedText className="text-sm font-medium text-text dark:text-text-dark">
                  {vital.bloodPressure}
                </ThemedText>
              </View>
              <View className="flex-row justify-between">
                <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark">
                  Heart Rate:
                </ThemedText>
                <ThemedText className="text-sm font-medium text-text dark:text-text-dark">
                  {vital.heartRate} bpm
                </ThemedText>
              </View>
              <View className="flex-row justify-between">
                <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark">
                  Respiratory Rate:
                </ThemedText>
                <ThemedText className="text-sm font-medium text-text dark:text-text-dark">
                  {vital.respiratoryRate} breaths/min
                </ThemedText>
              </View>
              <View className="flex-row justify-between">
                <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark">
                  Oxygen Saturation:
                </ThemedText>
                <ThemedText className="text-sm font-medium text-text dark:text-text-dark">
                  {vital.oxygenSaturation}%
                </ThemedText>
              </View>
              <View className="flex-row justify-between">
                <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark">
                  Height:
                </ThemedText>
                <ThemedText className="text-sm font-medium text-text dark:text-text-dark">
                  {vital.height} cm
                </ThemedText>
              </View>
              <View className="flex-row justify-between">
                <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark">
                  Weight:
                </ThemedText>
                <ThemedText className="text-sm font-medium text-text dark:text-text-dark">
                  {vital.weight} kg
                </ThemedText>
              </View>
              <View className="flex-row justify-between">
                <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark">
                  BMI:
                </ThemedText>
                <ThemedText className="text-sm font-medium text-text dark:text-text-dark">
                  {vital.bmi.toFixed(1)}
                </ThemedText>
              </View>
            </View>
          </PatientRecordCard>
        )}
      />
    </View>
  );
};

VitalsHistoryView.displayName = "VitalsHistoryView";

export default VitalsHistoryView;
