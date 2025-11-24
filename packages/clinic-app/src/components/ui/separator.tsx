import theme from "@app-constants/theme";
import { View, ViewStyle } from "react-native";

interface SeparatorProps {
  orientation?: "horizontal" | "vertical";
  thickness?: number;
  style?: ViewStyle;
}

const Separator = ({
  orientation = "horizontal",
  thickness = 1,
  style
}: SeparatorProps) => {
  return (
    <View
      style={[
        orientation === "horizontal"
          ? { height: thickness, width: "100%" }
          : { width: thickness, height: "100%" },
        { backgroundColor: theme.border },
        style
      ]}
    />
  );
};

export default Separator;
