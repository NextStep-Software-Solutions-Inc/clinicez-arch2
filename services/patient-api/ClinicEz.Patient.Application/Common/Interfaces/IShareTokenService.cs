using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Patient.Application.Common.Interfaces;

/// <summary>What a valid share token asserts.</summary>
public sealed record ShareTokenClaims(string TokenId, Guid PatientId, SharingScopes Scopes, string Purpose, DateTime ExpiresAtUtc);

public sealed record IssuedShareToken(string Value, string TokenId, DateTime ExpiresAtUtc);

public enum ShareTokenFailure { None, Malformed, BadSignature, Expired }

public sealed record ShareTokenValidation(ShareTokenFailure Failure, ShareTokenClaims? Claims)
{
    public bool IsValid => Failure == ShareTokenFailure.None;
}

/// <summary>Mints and verifies the short-lived signed tokens a patient shows as a QR code.</summary>
public interface IShareTokenService
{
    IssuedShareToken Issue(Guid patientId, SharingScopes scopes, string purpose);

    ShareTokenValidation Validate(string token);
}