import type React from "react";
import { Pressable } from "react-native";

export type RoundedButtonProps = {
	onPress: () => void;
	children: React.ReactNode;
	className?: string;
	color?: string; // background color
	rippleColor?: string;
	disabled?: boolean;
};

export default function RoundedButton({
	onPress,
	children,
	className = "",
	color = "bg-blue-600",
	rippleColor = "#2b6cb0",
	disabled = false,
}: RoundedButtonProps) {
	return (
		<Pressable
			onPress={onPress}
			className={`rounded-2xl py-4 px-12 shadow-md shadow-blue-600/20 w-full max-w-xl items-center justify-center ${color} ${className}`}
			android_ripple={{ color: rippleColor, borderless: false }}
			disabled={disabled}
			style={({ pressed }) => [
				{ borderRadius: 16, opacity: disabled ? 0.6 : pressed ? 0.92 : 1 },
			]}
		>
			{children}
		</Pressable>
	);
}
