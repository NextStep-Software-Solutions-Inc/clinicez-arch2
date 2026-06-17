namespace PatientApp.Application.Common.Constants;

/// <summary>
/// Canonical entity type names used in sync payloads.
/// Must match the C# class names of ISyncable domain entities exactly.
/// </summary>
public static class SyncableEntityTypes
{
    public const string Patient                  = nameof(Domain.Entities.Patient);
    public const string PatientGovernmentId      = nameof(Domain.Entities.PatientGovernmentId);
    public const string PatientAddress           = nameof(Domain.Entities.PatientAddress);
    public const string EmergencyContact         = nameof(Domain.Entities.EmergencyContact);
    public const string PatientAllergy           = nameof(Domain.Entities.PatientAllergy);
    public const string PatientMedication        = nameof(Domain.Entities.PatientMedication);
    public const string PatientSurgicalHistory   = nameof(Domain.Entities.PatientSurgicalHistory);
    public const string PatientPastIllness       = nameof(Domain.Entities.PatientPastIllness);
    public const string PatientChronicCondition  = nameof(Domain.Entities.PatientChronicCondition);
    public const string PatientFamilyHistory     = nameof(Domain.Entities.PatientFamilyHistory);
    public const string PatientSocialHistory     = nameof(Domain.Entities.PatientSocialHistory);
    public const string PatientObstetricProfile  = nameof(Domain.Entities.PatientObstetricProfile);
    public const string PatientMentalHealthProfile = nameof(Domain.Entities.PatientMentalHealthProfile);
    public const string FileRecord               = nameof(Domain.Entities.FileRecord);

    public static readonly HashSet<string> All =
    [
        Patient, PatientGovernmentId, PatientAddress, EmergencyContact,
        PatientAllergy, PatientMedication, PatientSurgicalHistory, PatientPastIllness,
        PatientChronicCondition, PatientFamilyHistory, PatientSocialHistory,
        PatientObstetricProfile, PatientMentalHealthProfile, FileRecord,
    ];
}
