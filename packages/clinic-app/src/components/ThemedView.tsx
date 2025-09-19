import React, { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { View, type ViewProps } from "react-native";
import { cn } from "@lib/utils";

const themeVariants = cva("", {
  variants: {
    variant: {
      default: "bg-white dark:bg-gray-900",
      elevated: "bg-white dark:bg-gray-800 shadow-sm",
      outlined: "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700",
      transparent: "bg-transparent",
      surface: "bg-gray-50 dark:bg-gray-800",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface ThemedViewProps
  extends Omit<ViewProps, "style">,
  VariantProps<typeof themeVariants> { }

export const ThemedView = forwardRef<View, ThemedViewProps>(
  ({ variant, className, ...props }, ref) => {
    return (
      <View
        ref={ref}
        className={cn(themeVariants({ variant }), className)}
        {...props}
      />
    );
  }
);

ThemedView.displayName = "ThemedView";

export default ThemedView;