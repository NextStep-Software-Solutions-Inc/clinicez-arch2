using System;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using ClinicEz.Shared.Licensing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace ClinicEz.Shared.Security.ClaimTokens;

/// <summary>
/// Issues and cryptographically validates progressive patient account claim tokens using HMAC-SHA256,
/// URL-safe Base64 encoding, and constant-time signature comparison to defeat timing attacks.
/// </summary>
public sealed class ClaimTokenService : IClaimTokenService
{
    private const int CurrentVersion = 1;
    private readonly byte[] _key;
    private readonly TimeProvider _clock;

    public ClaimTokenService(
        byte[] key,
        TimeProvider? clock = null)
    {
        ArgumentNullException.ThrowIfNull(key);
        if (key.Length < ClaimTokenOptions.MinimumKeyBytes)
        {
            throw new ArgumentException(
                $"Signing key must be at least {ClaimTokenOptions.MinimumKeyBytes} bytes (256 bits).", nameof(key));
        }

        _key = [.. key];
        _clock = clock ?? TimeProvider.System;
    }

    public ClaimTokenService(
        IOptions<ClaimTokenOptions>? options = null,
        IConfiguration? configuration = null,
        IHostEnvironment? environment = null,
        TimeProvider? clock = null)
    {
        _clock = clock ?? TimeProvider.System;

        var configuredKey = options?.Value?.SigningKey
            ?? configuration?[ClaimTokenOptions.SigningKeySetting]
            ?? Environment.GetEnvironmentVariable(ClaimTokenOptions.SigningKeyEnvironmentVariable);

        if (!string.IsNullOrWhiteSpace(configuredKey))
        {
            var keyBytes = Encoding.UTF8.GetBytes(configuredKey.Trim());
            if (keyBytes.Length < ClaimTokenOptions.MinimumKeyBytes)
            {
                throw new InvalidOperationException(
                    $"ClaimToken:SigningKey must be at least {ClaimTokenOptions.MinimumKeyBytes} bytes (256 bits).");
            }
            _key = keyBytes;
        }
        else if (LicenseKeyMaterial.IsDevelopment(environment))
        {
            _key = LicenseKeyMaterial.DevelopmentDocumentSecret();
        }
        else
        {
            throw new InvalidOperationException(
                "Claim token signing key is not configured. Set ClaimToken:SigningKey or CLAIM_TOKEN_SIGNING_KEY in production.");
        }
    }

    public ClaimTokenService() : this(options: null, configuration: null, environment: null, clock: null)
    {
    }

    public string IssueToken(ClaimTokenClaims claims)
    {
        ArgumentNullException.ThrowIfNull(claims);

        if (claims.JoinRequestId == Guid.Empty)
            throw new ArgumentException("JoinRequestId cannot be empty.", nameof(claims));
        if (string.IsNullOrWhiteSpace(claims.TenantSlug))
            throw new ArgumentException("TenantSlug is required.", nameof(claims));
        if (string.IsNullOrWhiteSpace(claims.FacilitySlug))
            throw new ArgumentException("FacilitySlug is required.", nameof(claims));
        if (string.IsNullOrWhiteSpace(claims.FirstName))
            throw new ArgumentException("FirstName is required.", nameof(claims));
        if (string.IsNullOrWhiteSpace(claims.LastName))
            throw new ArgumentException("LastName is required.", nameof(claims));

        var wirePayload = new WirePayload(
            Version: CurrentVersion,
            JoinRequestId: claims.JoinRequestId,
            TenantSlug: claims.TenantSlug.Trim(),
            FacilitySlug: claims.FacilitySlug.Trim(),
            Email: string.IsNullOrWhiteSpace(claims.Email) ? null : claims.Email.Trim(),
            FirstName: claims.FirstName.Trim(),
            LastName: claims.LastName.Trim(),
            DateOfBirth: claims.DateOfBirth.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            MemberType: string.IsNullOrWhiteSpace(claims.MemberType) ? null : claims.MemberType.Trim(),
            IssuedAtUnix: ToUnixSeconds(claims.IssuedAtUtc),
            ExpiresAtUnix: ToUnixSeconds(claims.ExpiresAtUtc)
        );

        var jsonBytes = JsonSerializer.SerializeToUtf8Bytes(wirePayload);
        var encodedPayload = Base64UrlEncode(jsonBytes);
        var signatureBytes = HMACSHA256.HashData(_key, Encoding.ASCII.GetBytes(encodedPayload));
        var encodedSignature = Base64UrlEncode(signatureBytes);

        return $"{encodedPayload}.{encodedSignature}";
    }

    public ClaimTokenValidationResult ValidateToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
            return ClaimTokenValidationResult.Malformed("Token is empty.");

        var parts = token.Split('.');
        if (parts.Length != 2 || parts[0].Length == 0 || parts[1].Length == 0)
            return ClaimTokenValidationResult.Malformed("Token format must be <payload>.<signature>.");

        if (parts[1].Length != 43)
            return ClaimTokenValidationResult.Malformed("Signature length is invalid.");

        var expectedSignatureBytes = HMACSHA256.HashData(_key, Encoding.ASCII.GetBytes(parts[0]));
        var expectedSignatureString = Base64UrlEncode(expectedSignatureBytes);

        if (!CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(parts[1]),
            Encoding.ASCII.GetBytes(expectedSignatureString)))
        {
            return ClaimTokenValidationResult.BadSignature();
        }

        WirePayload? payload;
        try
        {
            var payloadBytes = Base64UrlDecode(parts[0]);
            payload = JsonSerializer.Deserialize<WirePayload>(payloadBytes);
        }
        catch (Exception ex) when (ex is JsonException or FormatException)
        {
            return ClaimTokenValidationResult.Malformed("Token payload is not valid JSON.");
        }

        if (payload is null || payload.Version != CurrentVersion ||
            payload.JoinRequestId == Guid.Empty ||
            string.IsNullOrWhiteSpace(payload.TenantSlug) ||
            string.IsNullOrWhiteSpace(payload.FacilitySlug) ||
            string.IsNullOrWhiteSpace(payload.FirstName) ||
            string.IsNullOrWhiteSpace(payload.LastName) ||
            !DateOnly.TryParseExact(payload.DateOfBirth, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDob))
        {
            return ClaimTokenValidationResult.Malformed("Required claims are missing or invalid.");
        }

        var expiresAtUtc = DateTimeOffset.FromUnixTimeSeconds(payload.ExpiresAtUnix).UtcDateTime;
        if (expiresAtUtc <= _clock.GetUtcNow().UtcDateTime)
        {
            return ClaimTokenValidationResult.Expired();
        }

        var issuedAtUtc = DateTimeOffset.FromUnixTimeSeconds(payload.IssuedAtUnix).UtcDateTime;

        var claims = new ClaimTokenClaims(
            payload.JoinRequestId,
            payload.TenantSlug,
            payload.FacilitySlug,
            payload.Email,
            payload.FirstName,
            payload.LastName,
            parsedDob,
            payload.MemberType,
            issuedAtUtc,
            expiresAtUtc
        );

        return ClaimTokenValidationResult.Success(claims);
    }

    private static long ToUnixSeconds(DateTime dateTime)
    {
        var utc = dateTime.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(dateTime, DateTimeKind.Utc)
            : dateTime.ToUniversalTime();
        return new DateTimeOffset(utc).ToUnixTimeSeconds();
    }

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded = padded.PadRight(padded.Length + (4 - padded.Length % 4) % 4, '=');
        return Convert.FromBase64String(padded);
    }

    private sealed record WirePayload(
        [property: JsonPropertyName("v")] int Version,
        [property: JsonPropertyName("jti")] Guid JoinRequestId,
        [property: JsonPropertyName("tslug")] string TenantSlug,
        [property: JsonPropertyName("fslug")] string FacilitySlug,
        [property: JsonPropertyName("email")] string? Email,
        [property: JsonPropertyName("fn")] string FirstName,
        [property: JsonPropertyName("ln")] string LastName,
        [property: JsonPropertyName("dob")] string DateOfBirth,
        [property: JsonPropertyName("mt")] string? MemberType,
        [property: JsonPropertyName("iat")] long IssuedAtUnix,
        [property: JsonPropertyName("exp")] long ExpiresAtUnix
    );
}
