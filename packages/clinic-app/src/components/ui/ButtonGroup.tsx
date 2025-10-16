import React from "react";
import { View, Pressable, ViewProps } from "react-native";
import { cn } from "@lib/utils";
import ThemedText from "@components/ThemedText";

export interface ButtonGroupOption<T = string> {
  value: T;
  label: string;
  count?: number;
}

export interface ButtonGroupProps<T = string> extends Omit<ViewProps, "children"> {
  options: ButtonGroupOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  variant?: "filled" | "outlined";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ButtonGroup<T = string>({
  options,
  value,
  onValueChange,
  variant = "filled",
  size = "md",
  className,
  ...props
}: ButtonGroupProps<T>) {
  const getSizeClasses = () => {
    switch (size) {
      case "sm":
        return "px-3 py-1.5";
      case "lg":
        return "px-5 py-3";
      default:
        return "px-4 py-2";
    }
  };

  const getTextSize = () => {
    switch (size) {
      case "sm":
        return "caption";
      case "lg":
        return "body";
      default:
        return "label";
    }
  };

  return (
    <View className={cn("flex-row flex-wrap gap-2", className)} {...props}>
      {options.map((option, index) => {
        const isSelected = option.value === value;
        const sizeClasses = getSizeClasses();
        const textSize = getTextSize();

        return (
          <Pressable
            key={index}
            onPress={() => onValueChange(option.value)}
            className={cn(
              "rounded-lg items-center justify-center active:scale-95",
              sizeClasses,
              variant === "filled"
                ? isSelected
                  ? "bg-primary dark:bg-primary-dark"
                  : "bg-muted/20 dark:bg-muted-dark/20"
                : isSelected
                  ? "border-2 border-primary dark:border-primary-dark bg-primary/10 dark:bg-primary-dark/10"
                  : "border border-border dark:border-border-dark bg-transparent"
            )}
          >
            <ThemedText
              variant={textSize}
              className={cn(
                "font-semibold",
                variant === "filled"
                  ? isSelected
                    ? "text-primary-foreground dark:text-primary-foreground-dark"
                    : "text-text-secondary dark:text-text-secondary-dark"
                  : isSelected
                    ? "text-primary dark:text-primary-dark"
                    : "text-text-secondary dark:text-text-secondary-dark"
              )}
            >
              {option.label}
              {option.count !== undefined && ` (${option.count})`}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

ButtonGroup.displayName = "ButtonGroup";

export default ButtonGroup;
