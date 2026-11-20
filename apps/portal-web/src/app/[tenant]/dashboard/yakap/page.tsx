import { Metadata } from "next";
import YakapTransmittalClient from "@/components/dashboard/yakap/YakapTransmittalClient";

export const metadata: Metadata = {
  title: "PhilHealth YAKAP Telemetry | Clinic EZ Dashboard",
  description:
    "Multi-branch Zero-PHI telemetry console for PhilHealth YAKAP: monitor checkup submissions, status updates, and patient list sync.",
  keywords: [
    "PhilHealth YAKAP",
    "Zero-PHI Telemetry",
    "PhilHealth Claims",
    "Patient List Sync",
    "Clinic EZ",
  ],
};

export default function YakapPage() {
  return <YakapTransmittalClient />;
}
