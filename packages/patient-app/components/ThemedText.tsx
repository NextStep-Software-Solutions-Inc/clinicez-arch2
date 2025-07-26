import { StyleSheet, Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/useThemeColor';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  className,
  ...rest
}: ThemedTextProps & { className?: string }) {
  // Only set color in style if lightColor or darkColor is provided
  const color = (lightColor || darkColor)
    ? useThemeColor({ light: lightColor, dark: darkColor }, 'text')
    : undefined;

  return (
    <Text
      style={[
        color ? { color } : undefined,
        type === 'link' ? styles.link : undefined,
        style,
      ]}
      className={className}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  link: {
    lineHeight: 30,
    fontSize: 16,
    color: '#0a7ea4',
  },
});
