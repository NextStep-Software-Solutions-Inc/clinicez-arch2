import { FlatList, type FlatListProps, Image, Pressable, View, useColorScheme, useWindowDimensions } from "react-native";
import { ThemedText } from "./ThemedText";
import { cn, getInitials } from "@lib/utils";
import ThemedBadge from "./ThemedBadge";
import ThemedIcon from "./ThemedIcon";
import { formatDate } from "date-fns";
import { ChevronRight } from "lucide-react-native";
import { getThemeColor } from "@theme/colors";
import type { PatientSummary } from "@app-types/patient";

type PatientListProps = Omit<FlatListProps<PatientSummary>, "data" | "renderItem" | "keyExtractor"> & {
  patients: PatientSummary[];
  onPatientPress?: (patient: PatientSummary) => void;
};

const PatientList = ({ patients, contentContainerStyle, onPatientPress, ...props }: PatientListProps) => {
  const colorScheme = useColorScheme();
  const chevronColor = getThemeColor("muted", colorScheme === "dark" ? "dark" : "light");
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  return (
    <FlatList
      className="flex-1"
      contentContainerStyle={[{ paddingBottom: 0, flexGrow: 1 }, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      data={patients}
      keyExtractor={(item) => item.id.toString()}
      renderItem={({ item }) => (
        <Pressable
          className="mb-4 last:mb-4 w-full flex-row items-center gap-4 rounded-2xl border border-border bg-surface-elevated p-4 dark:border-border-dark dark:bg-surface-elevated-dark"
          onPress={() => onPatientPress?.(item)}
          accessibilityRole="button"
          accessibilityLabel={`View patient ${item.name}`}
        >
          <View className="items-center justify-center">
            <View className="h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-accent dark:bg-accent-dark">
              {item.profile?.uri ? (
                <Image source={{ uri: item.profile.uri }} className="h-16 w-16" />
              ) : (
                <ThemedText variant="header" className="text-2xl text-primary dark:text-primary-dark">
                  {getInitials(item.name)}
                </ThemedText>
              )}
            </View>
          </View>

          <View className="flex-1">
            <View className="flex-row justify-between gap-3">
              <View className="flex-1">
                <View className="flex-row flex-wrap items-baseline gap-x-1">
                  <ThemedText variant="label" className="font-semibold">
                    {item.name}
                  </ThemedText>
                  <ThemedText variant="subheader" className="text-sm text-muted dark:text-muted-dark">
                    , {item.age} years old
                  </ThemedText>
                </View>

                <View
                  className={cn(
                    "mt-3 gap-3",
                    isTablet ? "flex-row items-start gap-6" : "flex-col"
                  )}
                >
                  <View className={cn("flex-row flex-wrap items-center gap-2", isTablet && "flex-1")}>
                    {item.diagnosis && (
                      <ThemedBadge
                        variant="outline"
                        size="sm"
                        className="flex-row items-center gap-1 border border-error dark:border-error-dark"
                      >
                        <ThemedText className="text-sm text-error dark:text-error-dark">
                          {item.diagnosis.name}
                        </ThemedText>
                      </ThemedBadge>
                    )}
                    {item.hp && (
                      <ThemedBadge
                        variant="outline"
                        size="sm"
                        className="flex-row items-center gap-1 border border-primary dark:border-primary-dark"
                      >
                        <ThemedIcon icon="user" size="sm" color="primary" />
                        <ThemedText className="text-sm text-primary dark:text-primary-dark">
                          {item.hp.name}
                        </ThemedText>
                      </ThemedBadge>
                    )}
                  </View>

                  <View className={cn("flex-row flex-wrap items-center gap-x-6 gap-y-2", isTablet && "flex-1 justify-end")}>
                    <View className="flex-row items-center gap-1">
                      <ThemedIcon icon="clock" size="sm" color="muted" />
                      <ThemedText variant="caption" className="text-muted-foreground dark:text-muted-foreground-dark">
                        Last:
                      </ThemedText>
                      <ThemedText variant="caption" className="text-muted-foreground dark:text-muted-foreground-dark">
                        {formatDate(new Date(item.lastVisit), "MM/dd/yyyy")}
                      </ThemedText>
                    </View>
                    {item.nextAppointment && (
                      <View className="flex-row items-center gap-1">
                        <ThemedIcon icon="calendar" size="sm" color="muted" />
                        <ThemedText variant="caption" className="text-muted-foreground dark:text-muted-foreground-dark">
                          Next:
                        </ThemedText>
                        <ThemedText variant="caption" className="text-muted-foreground dark:text-muted-foreground-dark">
                          {formatDate(new Date(item.nextAppointment), "MM/dd/yyyy")}
                        </ThemedText>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              <View className="items-center justify-center">
                <ChevronRight size={20} color={chevronColor} />
              </View>
            </View>
          </View>
        </Pressable>
      )}
      {...props}
    />
  );
};
PatientList.displayName = "PatientList";

export default PatientList;