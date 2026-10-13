using System.Text.Json.Serialization;
using ClinicEz.Shared.Common;

namespace ClinicEz.Shared.Security.ClaimTokens;

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum ClaimTokenValidationStatus
{
    Valid,
    Expired,
    BadSignature,
    Malformed
}

public sealed record ClaimTokenValidationResult(
    ClaimTokenValidationStatus Status,
    ClaimTokenClaims? Claims,
    string? ErrorMessage = null)
{
    public bool IsValid => Status == ClaimTokenValidationStatus.Valid;

    public static ClaimTokenValidationResult Success(ClaimTokenClaims claims) =>
        new(ClaimTokenValidationStatus.Valid, claims);

    public static ClaimTokenValidationResult Expired(string? message = "Claim token has expired.") =>
        new(ClaimTokenValidationStatus.Expired, null, message);

    public static ClaimTokenValidationResult BadSignature(string? message = "Claim token signature is invalid or tampered.") =>
        new(ClaimTokenValidationStatus.BadSignature, null, message);

    public static ClaimTokenValidationResult Malformed(string? message = "Claim token is malformed.") =>
        new(ClaimTokenValidationStatus.Malformed, null, message);
}
