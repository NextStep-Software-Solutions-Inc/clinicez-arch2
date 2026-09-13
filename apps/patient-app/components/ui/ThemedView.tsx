import { View } from 'react-native';
import { useTheme } from '@react-navigation/native';

type Props = React.ComponentProps<typeof View> & {
  lightColor?: string;
  darkColor?: string;
};

export default function ThemedView({ lightColor, darkColor, style, ...rest }: Props) {
  const { dark } = useTheme();
  const backgroundColor = dark ? darkColor : lightColor;

  return <View {...rest} style={[backgroundColor ? { backgroundColor } : null, style]} />;
}
