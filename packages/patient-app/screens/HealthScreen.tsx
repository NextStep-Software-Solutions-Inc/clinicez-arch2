import { ScrollView } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import AllergiesSection from "./sections/AllergiesSection";
import ChronicConditionsSection from "./sections/ChronicConditionsSection";
import ClinicVisitsSection from "./sections/ClinicVisitsSection";
import LaboratoryResultsSection from "./sections/LaboratoryResultsSection";
import MedicalHistorySection from "./sections/MedicalHistorySection";
import ProceduresSection from "./sections/ProceduresSection";

export default function HealthScreen() {
	return (
		<ThemedView className="flex-1">
			<ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 8 }}>
				<MedicalHistorySection />
				<ChronicConditionsSection />
				<ProceduresSection />
				<ClinicVisitsSection />
				<LaboratoryResultsSection />
				<AllergiesSection />
			</ScrollView>
		</ThemedView>
	);
}
