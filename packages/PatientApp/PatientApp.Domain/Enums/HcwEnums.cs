namespace PatientApp.Domain.Enums;

public enum ClinicalAssessmentType
{
    OccupationalHealth, Phq9, Gad7, Cssrs, DentalVisit,
    EyeExam, CervicalScreening, BreastExam, Psa, TesticularExam
}

public enum VaccineAdverseReaction { None, Local, Systemic, Severe }

public enum VaccineProgram { DohEpi, Private, Travel, Occupational, Other }
