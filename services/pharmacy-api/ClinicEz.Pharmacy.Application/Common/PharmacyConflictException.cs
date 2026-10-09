using ClinicEz.Shared.Exceptions;

namespace ClinicEz.Pharmacy.Application.Common;

/// <summary>Machine-readable codes returned in <c>errors[].code</c> for pharmacy-specific HTTP 409 responses.</summary>
public static class PharmacyErrorCodes
{
    public const string PaymentRequired = "payment_required";
    public const string AcceptanceRequired = "acceptance_required";
    public const string InvalidState = "invalid_state";
}

/// <summary>A HTTP 409 that carries a stable, client-actionable code (the shared handler only emits a generic CONFLICT).</summary>
public sealed class PharmacyConflictException : ConflictException
{
    public PharmacyConflictException(string code, string message) : base(message)
    {
        Code = code;
    }

    public string Code { get; }
}
