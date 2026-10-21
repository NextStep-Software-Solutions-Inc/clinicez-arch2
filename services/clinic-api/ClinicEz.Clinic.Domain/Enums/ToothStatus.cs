namespace ClinicEz.Clinic.Domain.Enums;

/// <summary>
/// Clinical status of an individual tooth in the dental odontogram.
/// Uses plain-English clinical taxonomy conforming to clinicez-ui-ux-expert standards.
/// </summary>
public enum ToothStatus
{
    Healthy = 1,
    Decayed = 2,
    Filled = 3,
    Missing = 4,
    Crowned = 5,
    ForExtraction = 6,
    Sealant = 7,
    Fractured = 8,
    Impacted = 9,
    RootCanal = 10,
    Implant = 11
}
