import { AppointmentData, AppointmentStatus } from "@app-types/appointment";
import ThemedBadge from "@components/ThemedBadge";
import ThemedButton from "@components/ThemedButton";
import ThemedIcon from "@components/ThemedIcon";
import ThemedText from "@components/ThemedText";
import { FlatList, FlatListProps, Pressable, View } from "react-native";
import { cn } from "@lib/utils";
import { formatAppointmentDate } from "@lib/date-format";

interface AppointmentListProps extends Omit<FlatListProps<AppointmentData>, "renderItem"> {
  onAppointmentPress?: (appointment: AppointmentData) => void;
  onReceivePress?: (appointment: AppointmentData) => void;
  onRejectPress?: (appointment: AppointmentData) => void;
  onReschedulePress?: (appointment: AppointmentData) => void;
}

const getStatusBadgeColor = (status: AppointmentStatus) => {
  switch (status) {
    case "Accepted":
      return "bg-primary dark:bg-primary-dark";
    case "Completed":
      return "bg-success dark:bg-success-dark";
    case "Pending":
      return "bg-warning dark:bg-warning-dark";
    case "Rejected":
      return "bg-destructive dark:bg-destructive-dark";
    default:
      return "bg-muted dark:bg-muted-dark";
  }
};

const getStatusTextColor = (status: AppointmentStatus) => {
  switch (status) {
    case "Accepted":
      return "text-primary-foreground dark:text-primary-foreground";
    case "Completed":
      return "text-white dark:text-text-dark";
    case "Pending":
      return "text-warning-foreground dark:text-warning-foreground";
    case "Rejected":
      return "text-destructive-foreground dark:text-destructive-foreground";
    default:
      return "text-white dark:text-text-dark";
  }
};

const AppointmentList = ({ data, onAppointmentPress, onReceivePress, onRejectPress, onReschedulePress, ...props }: AppointmentListProps) => {
  const renderActionButtons = (item: AppointmentData) => {
    const isRejectedOrCompleted = item.status === "Rejected" || item.status === "Completed";
    const isPending = item.status === "Pending";

    if (isRejectedOrCompleted) {
      return (
        <View className="flex-row gap-2">
          <ThemedButton
            variant="outline"
            size="sm"
            className="flex-1"
            onPress={() => onReschedulePress?.(item)}
          >
            Reschedule
          </ThemedButton>
        </View>
      );
    }

    if (isPending) {
      return (
        <View className="flex-row gap-2">
          <ThemedButton
            variant="default"
            size="sm"
            className="flex-1"
            onPress={() => onReceivePress?.(item)}
          >
            Receive
          </ThemedButton>
          <ThemedButton
            variant="destructive"
            size="sm"
            className="flex-1"
            onPress={() => onRejectPress?.(item)}
          >
            Reject
          </ThemedButton>
          <ThemedButton
            variant="outline"
            size="sm"
            className="flex-1"
            onPress={() => onReschedulePress?.(item)}
          >
            Reschedule
          </ThemedButton>
        </View>
      );
    }

    return null;
  };

  return (
    <FlatList
      className="flex-1"
      showsVerticalScrollIndicator={false}
      {...props}
      data={data}
      keyExtractor={(item, index) => item.id?.toString() || index.toString()}
      renderItem={({ item }) => (
        <Pressable
          className="mb-4 w-full rounded-2xl border border-border bg-surface-elevated p-4 dark:border-border-dark dark:bg-surface-elevated-dark"
          onPress={() => onAppointmentPress?.(item)}
          accessibilityRole="button"
          accessibilityLabel={`View appointment with ${item.patient.name.firstName} ${item.patient.name.lastName}`}
        >
          <View className="flex-1 gap-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5">
                <ThemedIcon icon="clock" size="sm" color="muted" />
                <ThemedText variant="label" className="font-semibold text-text-secondary dark:text-text-secondary-dark">
                  {item.startTime} - {item.endTime} | {formatAppointmentDate(item.appointmentDate)}
                </ThemedText>
              </View>
              <ThemedBadge className={cn(getStatusBadgeColor(item.status))}>
                <ThemedText variant="caption" className={cn("font-semibold", getStatusTextColor(item.status))}>
                  {item.status}
                </ThemedText>
              </ThemedBadge>
            </View>

            <View className="flex-row items-center justify-between">
              <ThemedText variant="header" className="flex-1 font-bold text-text dark:text-text-dark">
                {item.patient.name.firstName} {item.patient.name.lastName}
              </ThemedText>
              <View className="flex-row gap-2">
                <ThemedBadge className="bg-primary/10 dark:bg-primary-dark/10 border border-primary dark:border-primary-dark">
                  <ThemedText variant="caption" className="font-medium text-primary dark:text-primary-dark">
                    {item.mode.name}
                  </ThemedText>
                </ThemedBadge>
                <ThemedBadge className="bg-primary/10 dark:bg-primary-dark/10 border border-primary dark:border-primary-dark">
                  <ThemedText variant="caption" className="font-medium text-primary dark:text-primary-dark">
                    {item.service.name}
                  </ThemedText>
                </ThemedBadge>
              </View>
            </View>

            <View className="rounded-lg bg-accent dark:bg-accent-dark border border-primary/20 dark:border-primary-dark/20 p-3">
              <ThemedText variant="label" className="font-bold text-primary dark:text-primary-dark mb-1">
                {item.chiefComplaint.name}
              </ThemedText>
              {item.chiefComplaint.description && (
                <ThemedText variant="caption" className="text-primary/80 dark:text-primary-dark/80">
                  {item.chiefComplaint.description}
                </ThemedText>
              )}
            </View>

            {renderActionButtons(item)}
          </View>
        </Pressable>
      )}
    />
  );
};
AppointmentList.displayName = "AppointmentList";

export default AppointmentList;