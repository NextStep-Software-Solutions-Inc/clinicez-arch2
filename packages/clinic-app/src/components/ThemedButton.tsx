import React, { type FC } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { TouchableOpacity, type TouchableOpacityProps, ActivityIndicator, Text } from "react-native";
import { cn } from "@lib/utils";
import ThemedText from "./ThemedText";

const buttonVariants = cva(
  "items-center justify-center rounded-lg px-4 py-3 active:scale-95 transition-transform",
  {
    variants: {
      variant: {
        default: "bg-blue-600 dark:bg-blue-500 text-white",
        destructive: "bg-red-600 dark:bg-red-500 text-white",
        outline: "border border-gray-300 dark:border-gray-600 bg-transparent",
        ghost: "bg-transparent",
        link: "bg-transparent underline"
      },
      size: {
        default: "px-4 py-2",
        sm: "px-3 py-2",
        lg: "px-5 py-3",
        icon: "px-2 py-2 items-center justify-center rounded-full",
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ThemedButtonProps
  extends Omit<TouchableOpacityProps, "style">,
  VariantProps<typeof buttonVariants> {
  children?: React.ReactNode;
  className?: string;
  variant?: "default" | "destructive" | "outline" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  disabled?: boolean;
  loading?: boolean;
}

export const ThemedButton: FC<ThemedButtonProps> = ({
  variant,
  size,
  className,
  loading = false,
  children,
  ...props
}) => {
  return (
    <TouchableOpacity
      className={cn(buttonVariants({ variant, size }), className)}
      activeOpacity={0.6}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "outline" || variant === "ghost" ? "currentColor" : "#ffffff"}
        />
      ) : (
        <ThemedText variant="button" className={variant === 'outline' || variant === 'ghost' ? 'text-blue-600 dark:text-blue-400' : 'text-white'}>
          {children}
        </ThemedText>
      )}
    </TouchableOpacity>
  );
};

export default ThemedButton;