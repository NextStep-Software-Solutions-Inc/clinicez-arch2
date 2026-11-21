export interface FacilityClassificationOption {
  value: string;
  label: string;
  description: string;
}

export const FACILITY_CLASSIFICATIONS: Record<string, FacilityClassificationOption[]> = {
  Clinic: [
    {
      value: "Ambulatory Clinic",
      label: "Ambulatory / Outpatient Clinic",
      description: "Primary care, family medicine, specialist consultation, and outpatient treatment.",
    },
    {
      value: "Dental Clinic",
      label: "Dental Clinic / Oral Health Center",
      description: "Comprehensive oral health, dental surgery, restorative dentistry, and orthodontics.",
    },
    {
      value: "Multi-Specialty Center",
      label: "Multi-Specialty Medical Center",
      description: "Integrated multispecialty clinical practice with multi-doctor consultation suites.",
    },
    {
      value: "Hemodialysis Center",
      label: "Free-standing Hemodialysis Center",
      description: "Specialized ambulatory dialysis clinic accredited with PhilHealth and DOH HFSRB.",
    },
    {
      value: "Surgical Outpatient Center",
      label: "Ambulatory Surgical Center",
      description: "Same-day minor and elective surgical procedures under local or MAC anesthesia.",
    },
  ],
  Laboratory: [
    {
      value: "Primary Clinical Laboratory",
      label: "Primary Clinical Laboratory",
      description: "Routine hematology (CBC), urinalysis, fecalysis, and rapid test kits.",
    },
    {
      value: "Secondary Clinical Laboratory",
      label: "Secondary Clinical Laboratory",
      description: "Primary tests plus routine clinical chemistry, blood typing, and quantitative tests.",
    },
    {
      value: "Tertiary Clinical Laboratory",
      label: "Tertiary Clinical Laboratory",
      description: "Secondary tests plus specialized chemistry, microbiology, immunology, and histopathology.",
    },
    {
      value: "Diagnostic & Imaging Center",
      label: "Diagnostic Center with Medical Imaging",
      description: "Clinical pathology combined with Digital X-Ray, Ultrasound, 2D Echo, and ECG.",
    },
  ],
  Pharmacy: [
    {
      value: "Community Pharmacy",
      label: "Retail / Community Pharmacy",
      description: "Independent or chain retail dispensary providing OTC and prescription medications.",
    },
    {
      value: "Hospital / Clinical Pharmacy",
      label: "Hospital / Outpatient Dispensary",
      description: "Institution-based pharmacy managing inpatient orders, compounding, and discharge Rx.",
    },
    {
      value: "Specialty Pharmacy",
      label: "Specialty / Compounding Pharmacy",
      description: "Specialized cold-chain biologics, oncology infusions, and compounding services.",
    },
  ],
  Organization: [
    {
      value: "Healthcare Network",
      label: "Hospital & Clinic Enterprise Network",
      description: "Integrated health enterprise governing multi-branch clinic, lab, and pharmacy clusters.",
    },
  ],
};
