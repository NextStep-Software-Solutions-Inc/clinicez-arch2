/**
 * This is a reusable patient list component that displays a list of patients with their details.
 * It uses FlatList for efficient rendering and supports theming for light and dark modes.
 * The component is designed to be used in various screens where patient information needs to be displayed.
 */

import { FlatList, type FlatListProps, Image, Pressable, View, useColorScheme, useWindowDimensions } from "react-native";
import { ThemedText } from "./ThemedText";
import { cn, getGenderInitial } from "@lib/utils";
import ThemedBadge from "./ThemedBadge";
import ThemedIcon from "./ThemedIcon";
import { formatDate } from "date-fns";
import { ChevronRight } from "lucide-react-native";
import { getThemeColor } from "@theme/colors";

// Mock patient list data for development purposes
export type PatientData = {
  id: number;
  name: string;
  profile?: {
    uri: string;
    alt?: string;
  }
  age: number;
  gender: string;
  // Healthcare Provider
  hp?: {
    name: string;
    specialization?: string;
  }
  diagnosis?: string;
  lastVisit: string; // ISO date string
  nextAppointment?: string; // ISO date string
}

const getPatientInitials = (fullName: string) =>
  fullName
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2);

type PatientListProps = Omit<FlatListProps<PatientData>, "data" | "renderItem" | "keyExtractor"> & {
  patients: PatientData[];
};

const PatientList = ({ patients, contentContainerStyle, ...props }: PatientListProps) => {
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
        <Pressable className="mb-4 last:mb-4 w-full flex-row items-center gap-4 rounded-2xl border border-border bg-surface-elevated p-4 dark:border-border-dark dark:bg-surface-elevated-dark">
          <View className="items-center justify-center">
            <View className="h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-accent dark:bg-accent-dark">
              {item.profile?.uri ? (
                <Image source={{ uri: item.profile.uri }} className="h-16 w-16" />
              ) : (
                <ThemedText variant="header" className="text-2xl text-primary dark:text-primary-dark">
                  {getPatientInitials(item.name)}
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
                          {item.diagnosis}
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