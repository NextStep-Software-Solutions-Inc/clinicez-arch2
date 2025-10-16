import React, { FC, useMemo } from "react";
import * as LucideIcons from "lucide-react-native";
import { LucideProps } from "lucide-react-native";
import { useColorScheme } from "nativewind";

import { getThemeColor, isThemeColorToken, type ThemeColorToken } from "@theme/colors";

export type IconName = string;
export type IconColor = ThemeColorToken | string;

const sizeMap = {
  sm: 16,
  default: 24,
  md: 24,
  lg: 32,
  xl: 40,
} as const;

const FALLBACK_PRIMARY: ThemeColorToken = "primary";

interface ThemedIconProps extends Omit<LucideProps, "size" | "color"> {
  icon: IconName;
  color?: IconColor;
  size?: keyof typeof sizeMap | number;
  className?: string;
}

const normalizeIconKey = (icon: IconName) => {
  if (!icon) {
    return null;
  }

  const trimmed = icon.trim();
  if (!trimmed) {
    return null;
  }

  const kebab = trimmed
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();

  const pascal = kebab
    .split("-")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");

  const candidates = [
    `${pascal}Icon`,
    pascal,
    `${pascal}icon`,
  ];

  if (/icon$/i.test(trimmed)) {
    candidates.unshift(trimmed);
  }

  return candidates;
};

const resolveIconComponent = (icon: IconName): FC<LucideProps> | undefined => {
  const candidates = normalizeIconKey(icon);
  if (!candidates) {
    return undefined;
  }

  for (const key of candidates) {
    const component = (LucideIcons as unknown as Record<string, FC<LucideProps>>)[key];
    if (component) {
      return component;
    }
  }

  return undefined;
};

const resolveColorToken = (color: IconColor | undefined, scheme: "light" | "dark"): string => {
  if (typeof color === "string") {
    if (isThemeColorToken(color)) {
      return getThemeColor(color, scheme);
    }

    return color;
  }

  return getThemeColor(FALLBACK_PRIMARY, scheme);
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

  const IconComponent = useMemo(() => resolveIconComponent(icon), [icon]);

  const iconSize = typeof size === "number" ? size : sizeMap[size] ?? sizeMap.default;

  const scheme = isDark ? "dark" : "light";
  const resolvedColor = useMemo(
    () => resolveColorToken(color, scheme),
    [color, scheme]
  );

  if (!IconComponent) {
    if (__DEV__) {
      console.warn(`ThemedIcon: Unable to find lucide icon for "${icon}"`);
    }
    return null;
  }

  return (
    <IconComponent
      size={iconSize}
      color={resolvedColor}
      className={className}
      {...props}
    />
  );
};

export default ThemedIcon;