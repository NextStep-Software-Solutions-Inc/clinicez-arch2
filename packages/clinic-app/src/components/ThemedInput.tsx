import React from "react";
import { TextInput, TextInputProps, View } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";
import ThemedIcon, { type IconName, type IconColor } from "./ThemedIcon";

const inputVariants = cva(
  "text-base text-text dark:text-text-dark bg-surface-elevated dark:bg-surface-elevated-dark border border-border dark:border-border-dark rounded px-3 py-2",
  {
    variants: {
      variant: {
        default: "border-border dark:border-border-dark",
        filled: "bg-surface dark:bg-surface-dark border border-border dark:border-border-dark",
        outlined: "bg-surface-elevated dark:bg-surface-elevated-dark border border-border dark:border-border-dark",
      },
      size: {
        sm: "text-sm py-2 px-2 min-h-9",
        md: "text-base py-3 px-3 min-h-12",
        lg: "text-lg py-4 px-4 min-h-14",
      },
      state: {
        default: "",
        error: "border-error dark:border-error-dark",
        success: "border-success dark:border-success-dark",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
      state: "default",
    },
  }
);

export interface ThemedInputProps
  extends Omit<TextInputProps, "style">,
  VariantProps<typeof inputVariants> {
  containerClassName?: string;
  leftIcon?: IconName | React.ReactNode;
  leftIconColor?: IconColor;
  rightIcon?: IconName | React.ReactNode;
  rightIconColor?: IconColor;
}

export const ThemedInput: React.FC<ThemedInputProps> = ({
  variant,
  size,
  state,
  containerClassName,
  leftIcon,
  leftIconColor = "muted",
  rightIcon,
  rightIconColor = "muted",
  className,
  ...props
}) => {
  const hasIcons = leftIcon || rightIcon;

  if (!hasIcons) {
    return (
      <TextInput
        className={cn(inputVariants({ variant, size, state }), className)}
        textAlignVertical="center"
        style={{
          lineHeight: undefined, // Prevent line height issues
          includeFontPadding: false, // Android specific - removes extra padding
        }}
        {...props}
      />
    );
  }

  const renderIcon = (icon: IconName | React.ReactNode, color: IconColor) => {
    if (typeof icon === "string") {
      return <ThemedIcon icon={icon as IconName} color={color} size="default" />;
    }
    return icon;
  };

  return (
    <View className={cn("relative", containerClassName)}>
      <TextInput
        className={cn(
          inputVariants({ variant, size, state }),
          leftIcon ? "pl-12" : "",
          rightIcon ? "pr-12" : "",
          className
        )}
        textAlignVertical="center"
        style={{
          lineHeight: undefined, // Prevent line height issues
          includeFontPadding: false, // Android specific - removes extra padding
        }}
        {...props}
      />
      {leftIcon && (
        <View className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
          {renderIcon(leftIcon, leftIconColor)}
        </View>
      )}
      {rightIcon && (
        <View className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
          {renderIcon(rightIcon, rightIconColor)}
        </View>
      )}
    </View>
  );
};