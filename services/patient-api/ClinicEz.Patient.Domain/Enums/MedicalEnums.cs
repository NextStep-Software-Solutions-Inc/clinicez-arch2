namespace ClinicEz.Patient.Domain.Enums;

public enum AllergyType { Food, Drug, Environmental, Contact, Other }

public enum AllergySeverity { Mild, Moderate, Severe, LifeThreatening }

public enum LabResultCategory
{
    Hematology, Chemistry, Microbiology, Serology,
    Urinalysis, Immunology, Histopathology, Other
}

public enum LabResultStatus { Pending, Preliminary, Final, Corrected }

public enum ImagingModality { XRay, CT, MRI, Ultrasound, PETScan, Fluoroscopy, Other }
