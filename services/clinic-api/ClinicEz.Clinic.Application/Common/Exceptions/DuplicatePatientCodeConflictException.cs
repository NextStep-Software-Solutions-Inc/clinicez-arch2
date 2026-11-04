using ClinicEz.Shared.Exceptions;

namespace ClinicEz.Clinic.Application.Common.Exceptions;

/// <summary>
/// Thrown when an explicit custom PatientCode entered during registration already belongs to an active patient in the clinic.
/// </summary>
public sealed class DuplicatePatientCodeConflictException : ConflictException
{
    public const string ErrorCode = "DUPLICATE_PATIENT_CODE";
    public const string FieldName = "patientCode";

    public string PatientCode { get; }

    public DuplicatePatientCodeConflictException(string patientCode)
        : base("A patient with this code already exists. Please use a different patient code.")
    {
        PatientCode = patientCode;
    }
}
