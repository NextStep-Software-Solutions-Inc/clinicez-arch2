import React from "react";
import { TextInput, TextInputProps, View } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";
import ThemedIcon, { type IconName, type IconColor } from "./ThemedIcon";

const inputVariants = cva(
  "text-base text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2",
  {
    variants: {
      variant: {
        default: "border-gray-300 dark:border-gray-600",
        filled: "bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700",
        outlined: "bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600",
      },
      size: {
        sm: "text-sm py-2 px-2 min-h-[40px]",
        md: "text-base py-3 px-3 min-h-[48px]",
        lg: "text-lg py-4 px-4 min-h-[56px]",
      },
      state: {
        default: "",
        error: "border-red-500 dark:border-red-400",
        success: "border-green-500 dark:border-green-400",
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