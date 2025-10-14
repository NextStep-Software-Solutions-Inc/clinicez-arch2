import React from "react";
import { View } from "react-native";

import ThemedText from "@components/ThemedText";
import Each from "@components/Each";
import { cn } from "@lib/utils";
import type { EmergencyContact } from "@app-types/patient";
import EmptyState from "./EmptyState";
import PatientRecordCard from "./PatientRecordCard";

interface EmergencyContactsViewProps {
  contacts: EmergencyContact[];
  className?: string;
}

const EmergencyContactsView: React.FC<EmergencyContactsViewProps> = ({ contacts, className }) => {
  if (!contacts || contacts.length === 0) {
    return <EmptyState message="No emergency contacts available." className={className} />;
  }

  return (
    <View className={cn("gap-3", className)}>
      <Each
        items={contacts}
        render={(contact) => (
          <PatientRecordCard>
            <ThemedText className="text-base font-semibold text-text dark:text-text-dark mb-2">
              {contact.name} - {contact.relation}
            </ThemedText>

            <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark">
              {contact.phone}
              {contact.address && ` - ${contact.address}`}
            </ThemedText>

            {contact.email && (
              <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark mt-1">
                {contact.email}
              </ThemedText>
            )}
          </PatientRecordCard>
        )}
      />
    </View>
  );
};

EmergencyContactsView.displayName = "EmergencyContactsView";

export default EmergencyContactsView;
