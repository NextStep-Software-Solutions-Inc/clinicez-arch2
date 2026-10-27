using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Licensing;

namespace ClinicEz.Shared.Security;

/// <summary>Standard comms permissions carried in staff tickets.</summary>
public static class CommsPermissions
{
    public const string MessagingRead = "messaging:read";
    public const string MessagingWrite = "messaging:write";
    public const string MessagingTriage = "messaging:triage";
    public const string TeleconsultCall = "teleconsult:call";
    public const string TeleconsultRecord = "teleconsult:record";
}

/// <summary>HTTP response contract for POST /api/v1/comms/ticket.</summary>
public sealed record CommsTicketResponseDto(
    [property: JsonPropertyName("ticket")] string Ticket,
    [property: JsonPropertyName("expiresAtUtc")] DateTime ExpiresAtUtc);

/// <summary>Claims payload of a 5-minute staff identity ticket for cross-service authentication.</summary>
public sealed record CommsTicketPayload
{
    [JsonPropertyName("sub")]
    public string Sub { get; init; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("tenant_id")]
    public string TenantId { get; init; } = string.Empty;

    [JsonPropertyName("facility_id")]
    public string FacilityId { get; init; } = string.Empty;

    [JsonPropertyName("branch_id")]
    public string? BranchId { get; init; }

    [JsonPropertyName("permissions")]
    public IReadOnlyList<string> Permissions { get; init; } = [];

    [JsonPropertyName("iss")]
    public string Iss { get; init; } = string.Empty;

    [JsonPropertyName("iat")]
    public long Iat { get; init; }

    [JsonPropertyName("nbf")]
    public long Nbf { get; init; }

    [JsonPropertyName("exp")]
    public long Exp { get; init; }

    [JsonPropertyName("jti")]
    public string Jti { get; init; } = string.Empty;
}

/// <summary>Result of validating a comms ticket.</summary>
public sealed record CommsTicketValidationResult
{
    public bool IsValid { get; init; }
    public CommsTicketPayload? Payload { get; init; }
    public string? ErrorMessage { get; init; }

    public static CommsTicketValidationResult Success(CommsTicketPayload payload) =>
        new() { IsValid = true, Payload = payload };

    public static CommsTicketValidationResult Failure(string error) =>
        new() { IsValid = false, ErrorMessage = error };
}

/// <summary>Signs compact ECDSA P-256 staff identity tickets.</summary>
public static class CommsTicketSigner
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = false };

    public static string Sign(CommsTicketPayload payload, string privateKeyPem)
    {
        ArgumentNullException.ThrowIfNull(payload);
        var normalizedPem = PemKey.Normalize(privateKeyPem, "signing key")
            ?? throw new ArgumentException("Private key is required.", nameof(privateKeyPem));

        var json = JsonSerializer.Serialize(payload, JsonOptions);
        var payloadBytes = Encoding.UTF8.GetBytes(json);

        using var ecdsa = PemKey.ImportEcdsa(normalizedPem, "signing key");
        var signatureBytes = ecdsa.SignData(payloadBytes, HashAlgorithmName.SHA256);

        var encodedPayload = Base64UrlHelper.Encode(payloadBytes);
        var encodedSignature = Base64UrlHelper.Encode(signatureBytes);

        return $"{encodedPayload}.{encodedSignature}";
    }

    public static (string Ticket, DateTime ExpiresAtUtc) IssueTicket(
        string clientId,
        string privateKeyPem,
        string staffId,
        string displayName,
        string tenantId,
        string facilityId,
        string? branchId,
        IReadOnlyList<string> permissions,
        TimeSpan? lifetime = null)
    {
        var now = DateTimeOffset.UtcNow;
        var validLifetime = lifetime ?? TimeSpan.FromMinutes(5);
        if (validLifetime > TimeSpan.FromMinutes(5))
        {
            validLifetime = TimeSpan.FromMinutes(5);
        }

        var expiresAt = now.Add(validLifetime);

        var payload = new CommsTicketPayload
        {
            Sub = staffId,
            Name = displayName,
            TenantId = tenantId,
            FacilityId = facilityId,
            BranchId = branchId,
            Permissions = permissions ?? [],
            Iss = clientId,
            Iat = now.ToUnixTimeSeconds(),
            Nbf = now.AddSeconds(-30).ToUnixTimeSeconds(),
            Exp = expiresAt.ToUnixTimeSeconds(),
            Jti = Guid.NewGuid().ToString("N")
        };

        var ticket = Sign(payload, privateKeyPem);
        return (ticket, expiresAt.UtcDateTime);
    }
}

/// <summary>Validates compact ECDSA P-256 staff identity tickets against Hub public keys.</summary>
public static class CommsTicketValidator
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private static readonly TimeSpan AllowedClockSkew = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan MaxTicketLifetime = TimeSpan.FromMinutes(5);

    /// <summary>Synchronously validates a ticket against a known public key PEM.</summary>
    public static CommsTicketValidationResult Validate(
        string? ticket,
        string publicKeyPem,
        string? expectedTenantId = null,
        string? expectedFacilityId = null,
        DateTimeOffset? now = null)
    {
        if (string.IsNullOrWhiteSpace(ticket))
            return CommsTicketValidationResult.Failure("Ticket is missing or empty.");

        var parts = ticket.Split('.');
        if (parts.Length != 2)
            return CommsTicketValidationResult.Failure("Malformed ticket structure: expected {payload}.{signature}.");

        byte[] payloadBytes;
        byte[] signatureBytes;
        try
        {
            payloadBytes = Base64UrlHelper.Decode(parts[0]);
            signatureBytes = Base64UrlHelper.Decode(parts[1]);
        }
        catch (Exception ex)
        {
            return CommsTicketValidationResult.Failure($"Invalid base64url encoding in ticket: {ex.Message}");
        }

        CommsTicketPayload? payload;
        try
        {
            payload = JsonSerializer.Deserialize<CommsTicketPayload>(payloadBytes, JsonOptions);
        }
        catch (Exception ex)
        {
            return CommsTicketValidationResult.Failure($"Failed to deserialize ticket payload: {ex.Message}");
        }

        if (payload is null)
            return CommsTicketValidationResult.Failure("Ticket payload is null.");

        var currentTime = (now ?? DateTimeOffset.UtcNow).ToUnixTimeSeconds();
        var skewSeconds = (long)AllowedClockSkew.TotalSeconds;

        if (payload.Iat <= 0)
            return CommsTicketValidationResult.Failure("Ticket issued-at timestamp (iat) is invalid.");

        if (payload.Iat > currentTime + skewSeconds)
            return CommsTicketValidationResult.Failure("Ticket issued-at timestamp (iat) is in the future.");

        if (payload.Nbf > payload.Exp)
            return CommsTicketValidationResult.Failure("Ticket validity window is inverted (nbf > exp).");

        if (payload.Nbf > currentTime + skewSeconds)
            return CommsTicketValidationResult.Failure("Ticket is not yet valid (nbf).");

        if (currentTime > payload.Exp + skewSeconds)
            return CommsTicketValidationResult.Failure("Ticket has expired (exp).");

        if (payload.Exp <= payload.Iat || checked(payload.Exp - payload.Iat) > (long)MaxTicketLifetime.TotalSeconds + skewSeconds)
            return CommsTicketValidationResult.Failure("Ticket TTL exceeds maximum 5 minutes.");

        if (expectedTenantId is not null && !string.Equals(payload.TenantId, expectedTenantId, StringComparison.OrdinalIgnoreCase))
            return CommsTicketValidationResult.Failure($"Ticket tenant '{payload.TenantId}' does not match expected '{expectedTenantId}'.");

        if (expectedFacilityId is not null && !string.Equals(payload.FacilityId, expectedFacilityId, StringComparison.OrdinalIgnoreCase))
            return CommsTicketValidationResult.Failure($"Ticket facility '{payload.FacilityId}' does not match expected '{expectedFacilityId}'.");

        string? normalizedPubPem;
        try
        {
            normalizedPubPem = PemKey.Normalize(publicKeyPem, "public key");
        }
        catch (Exception ex)
        {
            return CommsTicketValidationResult.Failure($"Invalid public key PEM format: {ex.Message}");
        }

        if (string.IsNullOrWhiteSpace(normalizedPubPem))
            return CommsTicketValidationResult.Failure("Public key is empty.");

        try
        {
            using var ecdsa = PemKey.ImportEcdsa(normalizedPubPem, "public key");
            if (!ecdsa.VerifyData(payloadBytes, signatureBytes, HashAlgorithmName.SHA256))
                return CommsTicketValidationResult.Failure("Invalid ticket signature.");
        }
        catch (Exception ex)
        {
            return CommsTicketValidationResult.Failure($"Cryptographic verification failure: {ex.Message}");
        }

        return CommsTicketValidationResult.Success(payload);
    }

    /// <summary>Validates a ticket against a HubSignerKey retrieved from the Hub.</summary>
    public static CommsTicketValidationResult ValidateWithKey(
        string? ticket,
        HubSignerKey? signerKey,
        string? expectedTenantId = null,
        string? expectedFacilityId = null,
        DateTimeOffset? now = null)
    {
        if (signerKey is null)
            return CommsTicketValidationResult.Failure("Signer key not found.");

        if (signerKey.Revoked)
            return CommsTicketValidationResult.Failure($"Signer client '{signerKey.ClientId}' is revoked.");

        if (string.IsNullOrWhiteSpace(signerKey.PublicKey))
            return CommsTicketValidationResult.Failure($"Signer client '{signerKey.ClientId}' has no public key registered.");

        // First parse payload to verify issuer claim matches signer client
        if (string.IsNullOrWhiteSpace(ticket))
            return CommsTicketValidationResult.Failure("Ticket is missing or empty.");

        var parts = ticket.Split('.');
        if (parts.Length != 2)
            return CommsTicketValidationResult.Failure("Malformed ticket structure: expected {payload}.{signature}.");

        try
        {
            var payloadBytes = Base64UrlHelper.Decode(parts[0]);
            var payload = JsonSerializer.Deserialize<CommsTicketPayload>(payloadBytes, JsonOptions);
            if (payload is not null && !string.Equals(payload.Iss, signerKey.ClientId, StringComparison.OrdinalIgnoreCase))
            {
                return CommsTicketValidationResult.Failure($"Ticket issuer '{payload.Iss}' does not match signer client id '{signerKey.ClientId}'.");
            }
        }
        catch (Exception ex)
        {
            return CommsTicketValidationResult.Failure($"Failed to inspect ticket payload: {ex.Message}");
        }

        return Validate(ticket, signerKey.PublicKey, expectedTenantId, expectedFacilityId, now);
    }

    /// <summary>Asynchronously resolves the signer key via IHubKeyClient and validates the ticket.</summary>
    public static async Task<CommsTicketValidationResult> ValidateAsync(
        string? ticket,
        IHubKeyClient keyClient,
        string? expectedTenantId = null,
        string? expectedFacilityId = null,
        DateTimeOffset? now = null,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(keyClient);

        if (string.IsNullOrWhiteSpace(ticket))
            return CommsTicketValidationResult.Failure("Ticket is missing or empty.");

        var parts = ticket.Split('.');
        if (parts.Length != 2)
            return CommsTicketValidationResult.Failure("Malformed ticket structure: expected {payload}.{signature}.");

        string issuer;
        try
        {
            var payloadBytes = Base64UrlHelper.Decode(parts[0]);
            var payload = JsonSerializer.Deserialize<CommsTicketPayload>(payloadBytes, JsonOptions);
            if (payload is null || string.IsNullOrWhiteSpace(payload.Iss))
                return CommsTicketValidationResult.Failure("Ticket payload has missing or empty issuer ('iss').");
            issuer = payload.Iss;
        }
        catch (Exception ex)
        {
            return CommsTicketValidationResult.Failure($"Failed to parse ticket payload: {ex.Message}");
        }

        var signerKey = await keyClient.GetSignerKeyAsync(issuer, ct);
        if (signerKey is null)
            return CommsTicketValidationResult.Failure($"Signer client '{issuer}' is unknown to the hub.");

        return ValidateWithKey(ticket, signerKey, expectedTenantId, expectedFacilityId, now);
    }
}
