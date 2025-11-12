import React from "react";
import { View } from "react-native";

import ThemedText from "@components/ThemedText";
import Each from "@components/Each";
import EmptyState from "./EmptyState";
import PatientRecordCard from "./PatientRecordCard";
import { cn } from "@lib/utils";
import { formatToYYYYMMDD } from "@lib/date-format";
import { formatHealthcareProvider } from "@lib/healthcare-provider-format";
import type { PatientBilling } from "@app-types/patient";

interface PatientBillingViewProps {
  billingHistory?: PatientBilling[];
  className?: string;
}

const PatientBillingView: React.FC<PatientBillingViewProps> = ({ billingHistory, className }) => {
  if (!billingHistory || billingHistory.length === 0) {
    return <EmptyState message="No billing records available." className={className} />;
  }

  const getCurrencySymbol = (currency: string) => {
    switch (currency.toUpperCase()) {
      case "PHP":
        return "₱";
      case "USD":
        return "$";
      case "EUR":
        return "€";
      default:
        return currency;
    }
  };

  return (
    <View className={cn("gap-3", className)}>
      <Each
        items={billingHistory}
        render={(billing) => (
          <PatientRecordCard>
            <View className="flex-row items-center justify-between mb-2">
              <ThemedText className="text-base font-semibold text-text dark:text-text-dark flex-1">
                {billing.service}
              </ThemedText>
              <ThemedText className="text-base font-bold text-text dark:text-text-dark ml-2">
                {getCurrencySymbol(billing.currency)} {billing.amount.toLocaleString()}
              </ThemedText>
            </View>

            <ThemedText className="text-sm text-text-secondary dark:text-text-secondary-dark">
              {formatToYYYYMMDD(billing.createdAt)} - {formatHealthcareProvider(billing.hp)}
            </ThemedText>

            {billing.status && (
              <View className="mt-2">
                <View
                  className={cn(
                    "self-start px-2 py-1 rounded",
                    billing.status === "paid" && "bg-success/20 dark:bg-success-dark/20",
                    billing.status === "pending" && "bg-warning/20 dark:bg-warning-dark/20",
                    billing.status === "overdue" && "bg-error/20 dark:bg-error-dark/20"
                  )}
                >
                  <ThemedText
                    className={cn(
                      "text-xs font-medium capitalize",
                      billing.status === "paid" && "text-success dark:text-success-dark",
                      billing.status === "pending" && "text-warning dark:text-warning-dark",
                      billing.status === "overdue" && "text-error dark:text-error-dark"
                    )}
                  >
                    {billing.status}
                  </ThemedText>
                </View>
              </View>
            )}
          </PatientRecordCard>
        )}
      />
    </View>
  );
};

PatientBillingView.displayName = "PatientBillingView";

export default PatientBillingView;
