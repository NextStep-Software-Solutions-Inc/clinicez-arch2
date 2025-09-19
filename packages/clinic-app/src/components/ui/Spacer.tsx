import { View } from "react-native";

export const Spacer = ({ size = 16, horizontal = false }: { size?: number; horizontal?: boolean }) => {
  return <View style={horizontal ? { width: size } : { height: size }} />;
}
Spacer.displayName = "Spacer";

export default Spacer;