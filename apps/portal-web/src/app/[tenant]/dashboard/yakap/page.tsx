import { Metadata } from "next";
import YakapTransmittalClient from "@/components/dashboard/yakap/YakapTransmittalClient";

export const metadata: Metadata = {
  title: "PhilHealth YAKAP Transmittals | Clinic EZ Dashboard",
  description:
    "Multi-branch transmittal console for PhilHealth YAKAP: compile Tranche 1 and Tranche 2 batch claims, inspect XML payloads, and submit statutory reports.",
  keywords: [
    "PhilHealth YAKAP",
    "YAKAP Transmittal",
    "Konsulta",
    "PhilHealth Claims",
    "Batch Transmittal",
    "Clinic EZ",
  ],
};

export default function YakapPage() {
  return <YakapTransmittalClient />;
}
