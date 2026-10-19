namespace ClinicEz.Clinic.Domain.Enums;

/// <summary>
/// Clinical status of an individual tooth in the dental odontogram.
/// Uses plain-English taxonomy conforming to clinicez-ui-ux-expert standards.
/// </summary>
public enum ToothStatus
{
    Healthy = 1,
    Decay = 2,
    Filled = 3,
    Missing = 4,
    Crown = 5,
    Extraction = 6
}
