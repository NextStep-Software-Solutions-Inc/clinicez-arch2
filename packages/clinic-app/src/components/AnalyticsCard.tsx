import { View } from "react-native";

import Each from "./Each";
import ThemedCard from "./ThemedCard";
import ThemedIcon from "./ThemedIcon";
import { ThemedText } from "./ThemedText";
import { cn } from "@lib/utils";

type AnalyticsCardData = {
  header: string;
  icon: string;
  body: string;
  sub?: string;
  percentageValue?: string;
  trend?: "up" | "down";
}

export interface AnalyticsCardProps extends React.ComponentProps<typeof ThemedCard> {
  analytics: AnalyticsCardData[];
}

const AnalyticsCard = ({ analytics, className, ...cardProps }: AnalyticsCardProps) => {
  return (
    <View className="mt-4 gap-3">
      <Each
        items={analytics}
        render={(item, index) => {
          const trendIcon = item.trend === "down" ? "trending-down" : "trending-up";
          const trendColor = item.trend === "down" ? "error" : "success";

          return (
            <ThemedCard
              key={`${item.header}-${index}`}
              className={cn("w-full", className)}
              {...cardProps}
            >
              <ThemedCard.Header className="flex-row items-center justify-between gap-3 pt-5 pb-3">
                <ThemedCard.Title className="accent-text dark:accent-text-dark">
                  {item.header}
                </ThemedCard.Title>
                <ThemedIcon icon={item.icon} color="info" />
              </ThemedCard.Header>
              <ThemedCard.Content className="mt-1 gap-1 pb-4">
                <ThemedText variant="header" className="accent-text dark:accent-text-dark">
                  {item.body}
                </ThemedText>
                {item.sub && (
                  <ThemedText variant="caption" className="text-muted dark:text-muted-dark">
                    {item.sub}
                  </ThemedText>
                )}
              </ThemedCard.Content>
              {item.percentageValue && (
                <ThemedCard.Footer className="mt-2 flex-row items-center justify-start gap-1 pb-4">
                  <ThemedIcon icon={trendIcon} color={trendColor} size="sm" />
                  <ThemedText
                    variant="caption"
                    className={cn(
                      "font-medium",
                      item.trend === "down"
                        ? "text-error dark:text-error-dark"
                        : "text-success dark:text-success-dark"
                    )}
                  >
                    {item.percentageValue}% from last month
                  </ThemedText>
                </ThemedCard.Footer>
              )}
            </ThemedCard>
          );
        }}
      />
    </View>
  );
};
AnalyticsCard.displayName = "AnalyticsCard";

export default AnalyticsCard;