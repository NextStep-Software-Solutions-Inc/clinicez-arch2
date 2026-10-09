using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Options;

namespace ClinicEz.Patient.Application.Features.Sharing;

/// <summary>
/// Share tokens are <c>base64url(payload).base64url(HMAC-SHA256(payload))</c>. The payload names the patient, the scopes the
/// patient picked and an expiry; it is readable by whoever scans the QR, but cannot be altered or forged without the key.
/// Single use is enforced separately by recording the token id when it is redeemed.
/// </summary>
public sealed class ShareTokenService : IShareTokenService
{
    private const int FormatVersion = 1;
    private const int TokenIdBytes = 16;

    private readonly byte[] _key;
    private readonly int _ttlSeconds;
    private readonly TimeProvider _clock;

    public ShareTokenService(IOptions<SharingOptions> options, TimeProvider clock)
    {
        var configured = options.Value;
        if (configured.SigningKey.Length < SharingOptions.MinimumSigningKeyLength)
            throw new InvalidOperationException(
                $"{SharingOptions.SectionName}:{nameof(SharingOptions.SigningKey)} must be at least {SharingOptions.MinimumSigningKeyLength} characters.");

        _key = Encoding.UTF8.GetBytes(configured.SigningKey);
        _ttlSeconds = configured.ShareTokenTtlSeconds;
        _clock = clock;
    }

    public IssuedShareToken Issue(Guid patientId, SharingScopes scopes, string purpose)
    {
        var tokenId = Convert.ToHexString(RandomNumberGenerator.GetBytes(TokenIdBytes)).ToLowerInvariant();
        var expiresAt = _clock.GetUtcNow().UtcDateTime.AddSeconds(_ttlSeconds);

        var payload = new Payload(FormatVersion, tokenId, patientId, (int)scopes, purpose, new DateTimeOffset(expiresAt).ToUnixTimeSeconds());
        var encodedPayload = Base64Url(JsonSerializer.SerializeToUtf8Bytes(payload));
        var token = $"{encodedPayload}.{Base64Url(Sign(encodedPayload))}";

        return new IssuedShareToken(token, tokenId, expiresAt);
    }

    public ShareTokenValidation Validate(string token)
    {
        var parts = token?.Split('.');
        if (parts is not { Length: 2 } || parts[0].Length == 0 || parts[1].Length == 0)
            return Fail(ShareTokenFailure.Malformed);

        byte[] presented;
        try { presented = FromBase64Url(parts[1]); }
        catch (FormatException) { return Fail(ShareTokenFailure.Malformed); }

        if (!CryptographicOperations.FixedTimeEquals(presented, Sign(parts[0])))
            return Fail(ShareTokenFailure.BadSignature);

        Payload? payload;
        try { payload = JsonSerializer.Deserialize<Payload>(FromBase64Url(parts[0])); }
        catch (Exception ex) when (ex is JsonException or FormatException) { return Fail(ShareTokenFailure.Malformed); }

        if (payload is null || payload.Version != FormatVersion || string.IsNullOrEmpty(payload.TokenId)
            || payload.PatientId == Guid.Empty || payload.Scopes == 0)
            return Fail(ShareTokenFailure.Malformed);

        var expiresAt = DateTimeOffset.FromUnixTimeSeconds(payload.ExpiresAtUnix).UtcDateTime;
        if (expiresAt <= _clock.GetUtcNow().UtcDateTime)
            return Fail(ShareTokenFailure.Expired);

        return new ShareTokenValidation(
            ShareTokenFailure.None,
            new ShareTokenClaims(payload.TokenId, payload.PatientId, (SharingScopes)payload.Scopes, payload.Purpose, expiresAt));
    }

    private byte[] Sign(string encodedPayload) => HMACSHA256.HashData(_key, Encoding.ASCII.GetBytes(encodedPayload));

    private static ShareTokenValidation Fail(ShareTokenFailure failure) => new(failure, null);

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] FromBase64Url(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded = padded.PadRight(padded.Length + (4 - padded.Length % 4) % 4, '=');
        return Convert.FromBase64String(padded);
    }

    private sealed record Payload(
        [property: JsonPropertyName("v")] int Version,
        [property: JsonPropertyName("jti")] string TokenId,
        [property: JsonPropertyName("pid")] Guid PatientId,
        [property: JsonPropertyName("sc")] int Scopes,
        [property: JsonPropertyName("pu")] string Purpose,
        [property: JsonPropertyName("exp")] long ExpiresAtUnix);
}