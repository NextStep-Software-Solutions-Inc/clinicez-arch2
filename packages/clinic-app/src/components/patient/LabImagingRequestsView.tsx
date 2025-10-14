import React from "react";
import { View } from "react-native";

import ThemedText from "@components/ThemedText";
import Each from "@components/Each";
import EmptyState from "./EmptyState";
import PatientRecordCard from "./PatientRecordCard";
import { cn } from "@lib/utils";
import { formatToYYYYMMDD } from "@lib/date-format";
import { formatHealthcareProvider } from "@lib/healthcare-provider-format";
import type { LabImagingRequest } from "@app-types/patient";

interface LabImagingRequestsViewProps {
  requests: LabImagingRequest[];
  className?: string;
}

const LabImagingRequestsView: React.FC<LabImagingRequestsViewProps> = ({ requests, className }) => {
  if (!requests || requests.length === 0) {
    return <EmptyState message="No lab or imaging requests available." className={className} />;
  }

  const getRequestName = (request: LabImagingRequest) => {
    if ("testName" in request) {
      return request.testName;
    }
    return request.imagingType;
  };

  const getRequestDate = (request: LabImagingRequest) => {
    if ("requestedAt" in request) {
      return request.requestedAt;
    }
    return "";
  };

  return (
    <View className={cn("gap-3", className)}>
      <Each
        items={requests}
        render={(request) => (
          <PatientRecordCard>
            <ThemedText className="text-base font-semibold text-text dark:text-text-dark mb-2">
              {getRequestName(request)}
            </ThemedText>

            <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark">
              {formatToYYYYMMDD(getRequestDate(request))} - {formatHealthcareProvider(request.requestedBy)}
            </ThemedText>
          </PatientRecordCard>
        )}
      />
    </View>
  );
};

LabImagingRequestsView.displayName = "LabImagingRequestsView";

export default LabImagingRequestsView;
