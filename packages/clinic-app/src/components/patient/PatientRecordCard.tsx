import React, { ReactNode } from "react";
import { View } from "react-native";

interface PatientRecordCardProps {
  children: ReactNode;
}

const PatientRecordCard: React.FC<PatientRecordCardProps> = ({ children }) => {
  return (
    <View className="rounded-xl bg-muted/10 dark:bg-muted-dark/10 px-4 py-4">
      {children}
    </View>
  );
};

PatientRecordCard.displayName = "PatientRecordCard";

export default PatientRecordCard;
