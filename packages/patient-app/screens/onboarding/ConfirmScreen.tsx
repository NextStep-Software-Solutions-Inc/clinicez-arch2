import "../../global.css";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import RoundedButton from "../../components/RoundedButton";

type ConfirmScreenProps = {
	onContinue: () => void;
	onBack?: () => void;
};

export default function ConfirmScreen({ onContinue }: ConfirmScreenProps) {
	return (
		<View className="flex-1 bg-white dark:bg-slate-900 p-0">
			{/* Main content distributed vertically */}
			<View className="flex-1 w-full flex-col justify-between items-center px-6 pb-10">
				<View className="flex-1 w-full justify-center items-center">
					<MaterialCommunityIcons
						name="check-circle"
						size={100}
						color="#22c55e"
						style={{ marginBottom: 24 }}
					/>
					<Text className="text-3xl font-extrabold text-green-600 mb-4 text-center">
						You're All Set!
					</Text>
					<Text className="text-base text-slate-600 dark:text-slate-300 text-center mb-10 leading-7 max-w-xl">
						You have successfully joined your clinic. You can now access all
						features of ClinicEZ.
					</Text>
					<RoundedButton onPress={onContinue}>
						<Text className="text-white font-bold text-lg tracking-wide text-center">
							Continue to App
						</Text>
					</RoundedButton>
				</View>
			</View>
		</View>
	);
}
