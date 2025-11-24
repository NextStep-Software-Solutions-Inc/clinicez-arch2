import { Appearance } from "react-native";
import { DarkTheme, LightTheme } from "./colors";

const theme = Appearance.getColorScheme() === "dark" ? DarkTheme : LightTheme;

export default theme;