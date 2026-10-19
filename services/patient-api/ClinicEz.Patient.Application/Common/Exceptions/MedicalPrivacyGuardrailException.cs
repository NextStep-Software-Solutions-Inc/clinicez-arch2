using System;
using ClinicEz.Patient.Application.Common.Errors;

namespace ClinicEz.Patient.Application.Common.Exceptions;

/// <summary>
/// Thrown when an authenticated adult attempts to merge health records of an unrelated adult into their account,
/// violating statutory sensitive personal information protections under Republic Act No. 10173 (Data Privacy Act of 2012).
/// </summary>
public sealed class MedicalPrivacyGuardrailException : Exception
{
    public string ErrorCode { get; } = ErrorCodes.MedicalPrivacyGuardrailBlocked;

    public MedicalPrivacyGuardrailException(string message = "For medical privacy, foreign health records cannot be merged into your personal account.")
        : base(message)
    {
    }
}
