using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.Security;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Shared.Tests.Security;

/// <summary>
/// Empirical adversarial challenge tests for CommsTicket signing, validation, and key resolution.
/// Stress-tests clock skew, expiration, future nbf, TTL boundaries, integer overflow,
/// signature tampering, malformed payloads, and revoked Hub signers.
/// </summary>
public class CommsTicketAdversarialTests
{
    private readonly string _privateKeyPem;
    private readonly string _publicKeyPem;
    private readonly string _clientId = "clinic-alpha-01";
    private readonly string _tenantId = "tenant-prod-a";
    private readonly string _facilityId = "fac-manila-01";
    private readonly string _staffId = "staff-doc-99";
    private readonly string _displayName = "Dr. Empirical Challenger";

    public CommsTicketAdversarialTests()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        _privateKeyPem = ecdsa.ExportECPrivateKeyPem();
        _publicKeyPem = ecdsa.ExportSubjectPublicKeyInfoPem();
    }

    [Fact]
    public void Ticket_WithFutureNbf_BeyondClockSkew_IsRejected()
    {
        // Clock skew is 30s. Test with Nbf = now + 65s (skew > 1 min)
        var now = DateTimeOffset.UtcNow;
        var payload = new CommsTicketPayload
        {
            Sub = _staffId,
            Name = _displayName,
            TenantId = _tenantId,
            FacilityId = _facilityId,
            Permissions = [CommsPermissions.MessagingRead],
            Iss = _clientId,
            Iat = now.ToUnixTimeSeconds(),
            Nbf = now.AddSeconds(65).ToUnixTimeSeconds(), // > 1 min in the future
            Exp = now.AddMinutes(5).ToUnixTimeSeconds(),
            Jti = Guid.NewGuid().ToString("N")
        };

        var ticket = CommsTicketSigner.Sign(payload, _privateKeyPem);
        var result = CommsTicketValidator.Validate(ticket, _publicKeyPem, _tenantId, _facilityId, now: now);

        result.IsValid.Should().BeFalse();
        result.ErrorMessage.Should().Contain("not yet valid (nbf)");
    }

    [Fact]
    public void Ticket_WithFutureNbf_ExactlyBeyond30sSkew_IsRejected()
    {
        var now = DateTimeOffset.UtcNow;
        var payload = new CommsTicketPayload
        {
            Sub = _staffId,
            Name = _displayName,
            TenantId = _tenantId,
            FacilityId = _facilityId,
            Permissions = [CommsPermissions.MessagingRead],
            Iss = _clientId,
            Iat = now.ToUnixTimeSeconds(),
            Nbf = now.AddSeconds(31).ToUnixTimeSeconds(), // 31s > 30s skew
            Exp = now.AddMinutes(5).ToUnixTimeSeconds(),
            Jti = Guid.NewGuid().ToString("N")
        };

        var ticket = CommsTicketSigner.Sign(payload, _privateKeyPem);
        var result = CommsTicketValidator.Validate(ticket, _publicKeyPem, _tenantId, _facilityId, now: now);

        result.IsValid.Should().BeFalse();
        result.ErrorMessage.Should().Contain("not yet valid (nbf)");
    }

    [Fact]
    public void Ticket_WithFutureNbf_Within30sSkew_IsAccepted()
    {
        var now = DateTimeOffset.UtcNow;
        var payload = new CommsTicketPayload
        {
            Sub = _staffId,
            Name = _displayName,
            TenantId = _tenantId,
            FacilityId = _facilityId,
            Permissions = [CommsPermissions.MessagingRead],
            Iss = _clientId,
            Iat = now.ToUnixTimeSeconds(),
            Nbf = now.AddSeconds(20).ToUnixTimeSeconds(), // 20s <= 30s skew
            Exp = now.AddMinutes(5).ToUnixTimeSeconds(),
            Jti = Guid.NewGuid().ToString("N")
        };

        var ticket = CommsTicketSigner.Sign(payload, _privateKeyPem);
        var result = CommsTicketValidator.Validate(ticket, _publicKeyPem, _tenantId, _facilityId, now: now);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Ticket_Expired_Beyond30sSkew_IsRejected()
    {
        var now = DateTimeOffset.UtcNow;
        var payload = new CommsTicketPayload
        {
            Sub = _staffId,
            Name = _displayName,
            TenantId = _tenantId,
            FacilityId = _facilityId,
            Permissions = [CommsPermissions.MessagingRead],
            Iss = _clientId,
            Iat = now.AddMinutes(-10).ToUnixTimeSeconds(),
            Nbf = now.AddMinutes(-10).ToUnixTimeSeconds(),
            Exp = now.AddSeconds(-31).ToUnixTimeSeconds(), // Expired 31s ago (> 30s skew)
            Jti = Guid.NewGuid().ToString("N")
        };

        var ticket = CommsTicketSigner.Sign(payload, _privateKeyPem);
        var result = CommsTicketValidator.Validate(ticket, _publicKeyPem, _tenantId, _facilityId, now: now);

        result.IsValid.Should().BeFalse();
        result.ErrorMessage.Should().Contain("expired (exp)");
    }

    [Fact]
    public void Ticket_Expired_Within30sSkew_IsAccepted()
    {
        var now = DateTimeOffset.UtcNow;
        var payload = new CommsTicketPayload
        {
            Sub = _staffId,
            Name = _displayName,
            TenantId = _tenantId,
            FacilityId = _facilityId,
            Permissions = [CommsPermissions.MessagingRead],
            Iss = _clientId,
            Iat = now.AddMinutes(-4).ToUnixTimeSeconds(),
            Nbf = now.AddMinutes(-4).ToUnixTimeSeconds(),
            Exp = now.AddSeconds(-15).ToUnixTimeSeconds(), // Expired 15s ago (<= 30s skew)
            Jti = Guid.NewGuid().ToString("N")
        };

        var ticket = CommsTicketSigner.Sign(payload, _privateKeyPem);
        var result = CommsTicketValidator.Validate(ticket, _publicKeyPem, _tenantId, _facilityId, now: now);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Ticket_WithTtl_Exceeding5MinutesPlusSkew_IsRejected()
    {
        var now = DateTimeOffset.UtcNow;
        // 5 min (300s) + 30s skew = 330s max allowed delta between Exp and Iat
        var payload = new CommsTicketPayload
        {
            Sub = _staffId,
            Name = _displayName,
            TenantId = _tenantId,
            FacilityId = _facilityId,
            Permissions = [CommsPermissions.MessagingRead],
            Iss = _clientId,
            Iat = now.ToUnixTimeSeconds(),
            Nbf = now.ToUnixTimeSeconds(),
            Exp = now.AddSeconds(331).ToUnixTimeSeconds(), // 331s > 330s
            Jti = Guid.NewGuid().ToString("N")
        };

        var ticket = CommsTicketSigner.Sign(payload, _privateKeyPem);
        var result = CommsTicketValidator.Validate(ticket, _publicKeyPem, _tenantId, _facilityId, now: now);

        result.IsValid.Should().BeFalse();
        result.ErrorMessage.Should().Contain("exceeds maximum 5 minutes");
    }

    [Fact]
    public void Ticket_WithTamperedSignature_BitFlipsAtMultiplePositions_AreAllRejected()
    {
        var (ticket, _) = CommsTicketSigner.IssueTicket(
            _clientId, _privateKeyPem, _staffId, _displayName, _tenantId, _facilityId, null, [CommsPermissions.MessagingRead]);

        var parts = ticket.Split('.');
        var sigBytes = Base64UrlHelper.Decode(parts[1]);

        // Flip bits at beginning, middle, and end of signature
        int[] testOffsets = [0, 1, sigBytes.Length / 2, sigBytes.Length - 2, sigBytes.Length - 1];
        foreach (var offset in testOffsets)
        {
            var corrupted = (byte[])sigBytes.Clone();
            corrupted[offset] ^= 0x01; // flip 1 bit

            var tamperedTicket = $"{parts[0]}.{Base64UrlHelper.Encode(corrupted)}";
            var result = CommsTicketValidator.Validate(tamperedTicket, _publicKeyPem, _tenantId, _facilityId);

            result.IsValid.Should().BeFalse($"signature bit-flip at offset {offset} must fail verification");
            result.ErrorMessage.Should().Contain("Invalid ticket signature");
        }
    }

    [Fact]
    public void Ticket_WithTruncatedOrPaddedSignature_IsRejected()
    {
        var (ticket, _) = CommsTicketSigner.IssueTicket(
            _clientId, _privateKeyPem, _staffId, _displayName, _tenantId, _facilityId, null, [CommsPermissions.MessagingRead]);

        var parts = ticket.Split('.');
        var sigBytes = Base64UrlHelper.Decode(parts[1]);

        // Truncated signature
        var truncated = new byte[sigBytes.Length - 10];
        Array.Copy(sigBytes, truncated, truncated.Length);
        var truncatedTicket = $"{parts[0]}.{Base64UrlHelper.Encode(truncated)}";

        var res1 = CommsTicketValidator.Validate(truncatedTicket, _publicKeyPem, _tenantId, _facilityId);
        res1.IsValid.Should().BeFalse();

        // Padded signature
        var padded = new byte[sigBytes.Length + 10];
        Array.Copy(sigBytes, padded, sigBytes.Length);
        var paddedTicket = $"{parts[0]}.{Base64UrlHelper.Encode(padded)}";

        var res2 = CommsTicketValidator.Validate(paddedTicket, _publicKeyPem, _tenantId, _facilityId);
        res2.IsValid.Should().BeFalse();
    }

    [Theory]
    [InlineData("sub", "attacker-999")]
    [InlineData("name", "Eve Hacked")]
    [InlineData("tenant_id", "forged-tenant")]
    [InlineData("facility_id", "forged-facility")]
    [InlineData("iss", "forged-issuer")]
    [InlineData("jti", "forged-jti")]
    public void Ticket_WithPayloadFieldTampered_FailsCryptographicVerification(string fieldName, string forgedValue)
    {
        var (ticket, _) = CommsTicketSigner.IssueTicket(
            _clientId, _privateKeyPem, _staffId, _displayName, _tenantId, _facilityId, null, [CommsPermissions.MessagingRead]);

        var parts = ticket.Split('.');
        var json = Encoding.UTF8.GetString(Base64UrlHelper.Decode(parts[0]));
        var tamperedJson = json.Replace($"\"{fieldName}\":\"", $"\"{fieldName}\":\"{forgedValue}\" /* tamper */ \"");

        // If replace didn't work directly, manually parse and rebuild
        var dict = JsonSerializer.Deserialize<Dictionary<string, object>>(json)!;
        dict[fieldName] = forgedValue;
        tamperedJson = JsonSerializer.Serialize(dict);

        var tamperedTicket = $"{Base64UrlHelper.Encode(Encoding.UTF8.GetBytes(tamperedJson))}.{parts[1]}";
        var result = CommsTicketValidator.Validate(tamperedTicket, _publicKeyPem, _tenantId, _facilityId);

        result.IsValid.Should().BeFalse($"tampering claim {fieldName} must fail signature verification");
    }

    [Fact]
    public void Ticket_WithMalformedBase64_ReturnsGracefulErrorWithoutThrowing()
    {
        string[] malformedTickets =
        [
            "not-valid-base64!.not-valid-signature!",
            "==invalid.==invalid",
            "abc.def!@#$%",
            "..",
            ".",
            "...."
        ];

        foreach (var bad in malformedTickets)
        {
            var action = () => CommsTicketValidator.Validate(bad, _publicKeyPem);
            action.Should().NotThrow();
            var result = CommsTicketValidator.Validate(bad, _publicKeyPem);
            result.IsValid.Should().BeFalse();
        }
    }

    [Fact]
    public void Ticket_WithMalformedJsonInPayload_ReturnsGracefulFailure()
    {
        var (validTicket, _) = CommsTicketSigner.IssueTicket(
            _clientId, _privateKeyPem, _staffId, _displayName, _tenantId, _facilityId, null, [CommsPermissions.MessagingRead]);

        var parts = validTicket.Split('.');

        string[] badPayloads =
        [
            "{ truncated json: true, ",
            "[1, 2, 3]",
            "\"plain string\"",
            "12345",
            ""
        ];

        foreach (var badPayload in badPayloads)
        {
            var encoded = Base64UrlHelper.Encode(Encoding.UTF8.GetBytes(badPayload));
            var ticket = $"{encoded}.{parts[1]}";

            var result = CommsTicketValidator.Validate(ticket, _publicKeyPem);
            result.IsValid.Should().BeFalse();
        }
    }

    [Fact]
    public void Ticket_WithGarbageOrEmptyPublicKeyPem_ReturnsGracefulFailure()
    {
        var (ticket, _) = CommsTicketSigner.IssueTicket(
            _clientId, _privateKeyPem, _staffId, _displayName, _tenantId, _facilityId, null, [CommsPermissions.MessagingRead]);

        string[] badKeys =
        [
            "",
            "   ",
            "-----BEGIN PUBLIC KEY-----\nNOT_BASE_64\n-----END PUBLIC KEY-----",
            "not a pem at all"
        ];

        foreach (var badKey in badKeys)
        {
            var action = () => CommsTicketValidator.Validate(ticket, badKey);
            action.Should().NotThrow();
            var result = CommsTicketValidator.Validate(ticket, badKey);
            result.IsValid.Should().BeFalse();
        }
    }

    [Fact]
    public void ValidateWithKey_WithNullOrRevokedKey_Fails()
    {
        var (ticket, _) = CommsTicketSigner.IssueTicket(
            _clientId, _privateKeyPem, _staffId, _displayName, _tenantId, _facilityId, null, [CommsPermissions.MessagingRead]);

        // Null signer key
        var nullResult = CommsTicketValidator.ValidateWithKey(ticket, null);
        nullResult.IsValid.Should().BeFalse();
        nullResult.ErrorMessage.Should().Contain("Signer key not found");

        // Revoked signer key
        var revokedKey = new HubSignerKey(_clientId, "c1", "clinic", HubClientKind.CloudService, _publicKeyPem, Revoked: true);
        var revokedResult = CommsTicketValidator.ValidateWithKey(ticket, revokedKey);
        revokedResult.IsValid.Should().BeFalse();
        revokedResult.ErrorMessage.Should().Contain("revoked");

        // Signer key with empty public key
        var emptyKey = new HubSignerKey(_clientId, "c1", "clinic", HubClientKind.CloudService, "", Revoked: false);
        var emptyResult = CommsTicketValidator.ValidateWithKey(ticket, emptyKey);
        emptyResult.IsValid.Should().BeFalse();
        emptyResult.ErrorMessage.Should().Contain("no public key registered");
    }

    [Fact]
    public async Task ValidateAsync_WithNullKeyClient_ThrowsArgumentNullException()
    {
        var (ticket, _) = CommsTicketSigner.IssueTicket(
            _clientId, _privateKeyPem, _staffId, _displayName, _tenantId, _facilityId, null, [CommsPermissions.MessagingRead]);

        var act = async () => await CommsTicketValidator.ValidateAsync(ticket, null!);
        await act.Should().ThrowAsync<ArgumentNullException>();
    }

    [Fact]
    public void Ticket_WithInvertedWindow_NbfGreaterThanExp_Behavior()
    {
        var now = DateTimeOffset.UtcNow;
        var payload = new CommsTicketPayload
        {
            Sub = _staffId,
            Name = _displayName,
            TenantId = _tenantId,
            FacilityId = _facilityId,
            Permissions = [CommsPermissions.MessagingRead],
            Iss = _clientId,
            Iat = now.ToUnixTimeSeconds(),
            Nbf = now.AddSeconds(20).ToUnixTimeSeconds(),
            Exp = now.AddSeconds(10).ToUnixTimeSeconds(), // Exp < Nbf!
            Jti = Guid.NewGuid().ToString("N")
        };

        var ticket = CommsTicketSigner.Sign(payload, _privateKeyPem);
        var result = CommsTicketValidator.Validate(ticket, _publicKeyPem, _tenantId, _facilityId, now: now);

        // Remediated: inverted validity window (nbf > exp) must fail validation
        result.IsValid.Should().BeFalse();
        result.ErrorMessage.Should().Contain("inverted (nbf > exp)");
    }

    [Fact]
    public void Ticket_WithFutureIat_AndLongExpiration_BypassesTtlLimit()
    {
        var now = DateTimeOffset.UtcNow;
        var payload = new CommsTicketPayload
        {
            Sub = _staffId,
            Name = _displayName,
            TenantId = _tenantId,
            FacilityId = _facilityId,
            Permissions = [CommsPermissions.MessagingRead],
            Iss = _clientId,
            Iat = now.AddHours(2).ToUnixTimeSeconds(), // iat 2 hours in future
            Nbf = now.ToUnixTimeSeconds(),
            Exp = now.AddHours(2).AddSeconds(100).ToUnixTimeSeconds(), // exp 2 hours + 100s in future
            Jti = Guid.NewGuid().ToString("N")
        };

        var ticket = CommsTicketSigner.Sign(payload, _privateKeyPem);
        var result = CommsTicketValidator.Validate(ticket, _publicKeyPem, _tenantId, _facilityId, now: now);

        // Remediated: post-dated future iat must be rejected
        result.IsValid.Should().BeFalse();
        result.ErrorMessage.Should().Contain("in the future");
    }

    [Fact]
    public void Ticket_WithIntegerOverflow_IatLongMinValue_BypassesTtlCheck()
    {
        var now = DateTimeOffset.UtcNow;
        var payload = new CommsTicketPayload
        {
            Sub = _staffId,
            Name = _displayName,
            TenantId = _tenantId,
            FacilityId = _facilityId,
            Permissions = [CommsPermissions.MessagingRead],
            Iss = _clientId,
            Iat = long.MinValue,
            Nbf = now.ToUnixTimeSeconds(),
            Exp = now.AddMinutes(10).ToUnixTimeSeconds(), // 10 minutes > 5 minutes max!
            Jti = Guid.NewGuid().ToString("N")
        };

        var ticket = CommsTicketSigner.Sign(payload, _privateKeyPem);
        var result = CommsTicketValidator.Validate(ticket, _publicKeyPem, _tenantId, _facilityId, now: now);

        // Remediated: non-positive iat / integer overflow vectors must be rejected safely
        result.IsValid.Should().BeFalse();
        result.ErrorMessage.Should().Contain("invalid");
    }

    [Fact]
    public void IssueTicket_ClampsRequestedLifetimeTo5Minutes()
    {
        var (_, expiresAt) = CommsTicketSigner.IssueTicket(
            _clientId, _privateKeyPem, _staffId, _displayName, _tenantId, _facilityId, null,
            [CommsPermissions.MessagingRead],
            lifetime: TimeSpan.FromHours(1));

        expiresAt.Should().BeOnOrBefore(DateTime.UtcNow.AddMinutes(5).AddSeconds(2));
    }
}
