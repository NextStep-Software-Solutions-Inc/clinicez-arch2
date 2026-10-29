import { Metadata } from "next";
import YakapTransmittalClient from "@/components/dashboard/yakap/YakapTransmittalClient";

export const metadata: Metadata = {
  title: "PhilHealth YAKAP 2.0 Telemetry | Clinic EZ Dashboard",
  description:
    "Multi-branch Zero-PHI telemetry console for PhilHealth YAKAP 2.0: monitor PCAPI submissions, 23B transaction states, asynchronous batch polling, and Service 05 Masterlist synchronization.",
  keywords: [
    "PhilHealth YAKAP 2.0",
    "PCAPI",
    "Zero-PHI Telemetry",
    "Konsulta",
    "PhilHealth Claims",
    "Masterlist Sync",
    "Clinic EZ",
  ],
};

export default function YakapPage() {
  return <YakapTransmittalClient />;
}
