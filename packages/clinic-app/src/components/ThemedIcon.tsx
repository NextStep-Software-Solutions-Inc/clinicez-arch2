import React, { FC } from "react";
import {
  HomeIcon,
  UserIcon,
  SettingsIcon,
  SearchIcon,
  BellIcon,
  LockIcon,
  CheckIcon,
  XIcon
} from "lucide-react-native";

import { LucideProps } from "lucide-react-native";
import { useColorScheme } from "nativewind";

export type IconName = "home" | "user" | "settings" | "search" | "bell" | "lock" | "check" | "x";
export type IconColor = "primary" | "secondary" | "muted" | "error" | "success" | "warning" | "info" | "accent";

const sizeMap = {
  sm: 16,
  default: 24,
  md: 24,
  lg: 32,
  xl: 40,
} as const;

const getColorValue = (colorName: IconColor, isDark: boolean): string => {
  const colorMap = {
    primary: isDark ? "#60A5FA" : "#3B82F6",
    secondary: isDark ? "#C4B5FD" : "#A855F7",
    muted: isDark ? "#9CA3AF" : "#6B7280",
    error: isDark ? "#F87171" : "#EF4444",
    success: isDark ? "#34D399" : "#10B981",
    warning: isDark ? "#FBBF24" : "#F59E0B",
    info: isDark ? "#60A5FA" : "#3B82F6",
    accent: isDark ? "#FBBF24" : "#F59E0B",
  };
  return colorMap[colorName];
};

interface ThemedIconProps extends
  Omit<LucideProps, "size" | "color"> {
  icon: IconName;
  color?: IconColor;
  size?: keyof typeof sizeMap;
  className?: string;
}

const Icons: Record<IconName, FC<LucideProps>> = {
  home: HomeIcon,
  user: UserIcon,
  settings: SettingsIcon,
  search: SearchIcon,
  bell: BellIcon,
  lock: LockIcon,
  check: CheckIcon,
  x: XIcon,
};

const ThemedIcon: FC<ThemedIconProps> = ({
  icon,
  size = "default",
  color = "primary",
  className,
  ...props
}) => {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const IconComponent = Icons[icon];
  if (!IconComponent) return null;

  const iconSize = sizeMap[size];
  const iconColor = getColorValue(color, isDark);

  return (
    <IconComponent
      size={iconSize}
      color={iconColor}
      className={className}
      {...props}
    />
  );
};

export default ThemedIcon;