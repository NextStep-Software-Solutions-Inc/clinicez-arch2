// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Feather from '@expo/vector-icons/Feather';
import { SymbolWeight } from 'expo-symbols';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';



// Unified mapping for Material and Feather icons
const MAPPING = {
  'house': { type: 'feather', name: 'home' },
  'paperplane.fill': { type: 'material', name: 'send' },
  'chevron.left.forwardslash.chevron.right': { type: 'material', name: 'code' },
  'chevron.right': { type: 'material', name: 'chevron-right' },
  'calendar': { type: 'feather', name: 'calendar' },
  'heart': { type: 'feather', name: 'heart' },
  'person': { type: 'material', name: 'person' },
} as const;
type IconSymbolName = keyof typeof MAPPING;


/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  const icon = MAPPING[name];
  if (icon.type === 'feather') {
    return <Feather color={color as string} size={size} name={icon.name} style={style} />;
  }
  return <MaterialIcons color={color} size={size} name={icon.name} style={style} />;
}
