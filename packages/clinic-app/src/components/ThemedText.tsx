import React, { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Text, type TextProps } from "react-native";
import { cn } from "@lib/utils";

type TextVariant = "header" | "subheader" | "body" | "label" | "caption" | "button" | "error";
type TextColor =
  | "primary"
  | "primaryContrast"
  | "secondary"
  | "muted"
  | "mutedForeground"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "accent"
  | "text"
  | "textSecondary";

const textVariants = cva("text-text dark:text-text-dark", {
  variants: {
    variant: {
      header: "text-2xl font-bold leading-tight text-primary dark:text-primary-dark",
      subheader: "text-xl font-semibold leading-snug text-text-secondary dark:text-text-secondary-dark",
      body: "text-base leading-relaxed",
      label: "text-md font-medium text-text dark:text-text-dark",
      caption: "text-sm leading-normal text-muted-foreground dark:text-muted-foreground-dark",
      button: "text-base font-medium tracking-wide leading-normal text-primary-contrast dark:text-primary-contrast-dark",
      error: "text-base font-medium text-error dark:text-error-dark",
    },
    color: {
      primary: "text-primary dark:text-primary-dark",
      primaryContrast: "text-primary-contrast dark:text-primary-contrast-dark",
      secondary: "text-text-secondary dark:text-text-secondary-dark",
      muted: "text-muted dark:text-muted-dark",
      mutedForeground: "text-muted-foreground dark:text-muted-foreground-dark",
      error: "text-error dark:text-error-dark",
      success: "text-success dark:text-success-dark",
      warning: "text-warning dark:text-warning-dark",
      info: "text-info dark:text-info-dark",
      accent: "text-accent dark:text-accent-dark",
      text: "text-text dark:text-text-dark",
      textSecondary: "text-text-secondary dark:text-text-secondary-dark",
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
  style?: TextProps["style"];
}

export const ThemedText = forwardRef<Text, ThemedTextProps>(
  ({ variant, color, className, style, ...props }, ref) => {
    return (
      <Text
        ref={ref}
        className={cn(textVariants({ variant, color }), className)}
        style={style}
        {...props}
      />
    );
  }
);

ThemedText.displayName = "ThemedText";

export default ThemedText;