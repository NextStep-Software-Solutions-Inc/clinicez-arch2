import { View } from "react-native";
import { ProfileTabButton } from "../atoms/ProfileTabButton";

export type ProfileTabId = "personal" | "medical" | "emergency";

const TABS: {
	id: ProfileTabId;
	label: string;
	icon: React.ComponentProps<typeof ProfileTabButton>["icon"];
}[] = [
	{ id: "personal", label: "Personal", icon: "user" },
	{ id: "medical", label: "Medical", icon: "activity" },
	{ id: "emergency", label: "Emergency", icon: "phone" },
];

type Props = {
	active: ProfileTabId;
	onChange: (tab: ProfileTabId) => void;
};

/** Three-tab pill bar for navigating between profile sections. */
export function ProfileTabBar({ active, onChange }: Props) {
	return (
		<View
			style={{
				flexDirection: "row",
				backgroundColor: "#f1f5f9",
				borderRadius: 14,
				padding: 4,
				marginBottom: 16,
			}}
		>
			{TABS.map((tab) => (
				<ProfileTabButton
					key={tab.id}
					id={tab.id}
					label={tab.label}
					icon={tab.icon}
					isActive={active === tab.id}
					onPress={() => onChange(tab.id)}
				/>
			))}
		</View>
	);
}
