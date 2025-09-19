import React, { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Text, type TextProps } from "react-native";
import { cn } from "@lib/utils";

type TextVariant = "header" | "subheader" | "body" | "label" | "caption" | "button" | "error";
type TextColor = "primary" | "secondary" | "muted" | "error" | "success" | "warning" | "info" | "accent";

const textVariants = cva("text-gray-900 dark:text-gray-100", {
  variants: {
    variant: {
      header: "text-2xl font-bold leading-tight",
      subheader: "text-xl font-semibold leading-snug",
      body: "text-base leading-relaxed",
      label: "text-md font-medium",
      caption: "text-sm leading-normal text-gray-600 dark:text-gray-400",
      button: "text-base font-medium tracking-wide",
      error: "text-base font-medium text-red-600 dark:text-red-400",
    },
    color: {
      primary: "text-gray-900 dark:text-gray-100",
      secondary: "text-gray-600 dark:text-gray-300",
      muted: "text-gray-500 dark:text-gray-400",
      error: "text-red-600 dark:text-red-400",
      success: "text-emerald-600 dark:text-emerald-400",
      warning: "text-amber-600 dark:text-amber-400",
      info: "text-blue-600 dark:text-blue-400",
      accent: "text-purple-600 dark:text-purple-400",
    }
  },
  defaultVariants: {
    variant: "body",
    color: "primary",
  }
});

export interface ThemedTextProps
  extends Omit<TextProps, "style">,
  VariantProps<typeof textVariants> {
  variant?: TextVariant;
  color?: TextColor;
}

export const ThemedText = forwardRef<Text, ThemedTextProps>(
  ({ variant, color, className, ...props }, ref) => {
    return (
      <Text
        ref={ref}
        className={cn(textVariants({ variant, color }), className)}
        {...props}
      />
    );
  }
);

ThemedText.displayName = "ThemedText";

export default ThemedText;