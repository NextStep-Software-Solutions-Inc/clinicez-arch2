using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.Security;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Shared.Tests.Security;

public class CommsTicketTests
{
    private readonly string _privateKeyPem;
    private readonly string _publicKeyPem;
    private readonly string _clientId = "clinic-client-01";
    private readonly string _tenantId = "tenant-123";
    private readonly string _facilityId = "fac-456";
    private readonly string _branchId = "branch-789";
    private readonly string _staffId = "staff-001";
    private readonly string _displayName = "Dr. Maria Santos";

    public CommsTicketTests()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        _privateKeyPem = ecdsa.ExportECPrivateKeyPem();
        _publicKeyPem = ecdsa.ExportSubjectPublicKeyInfoPem();
    }

    [Fact]
    public void ValidTicket_ValidatesSuccessfully_AndPreservesAllClaims()
    {
        var permissions = new[] { CommsPermissions.MessagingRead, CommsPermissions.MessagingWrite, CommsPermissions.TeleconsultCall };
        var (ticket, expiresAtUtc) = CommsTicketSigner.IssueTicket(
            _clientId,
            _privateKeyPem,
            _staffId,
            _displayName,
            _tenantId,
            _facilityId,
            _branchId,
            permissions);

        ticket.Should().NotBeNullOrWhiteSpace();
        expiresAtUtc.Should().BeCloseTo(DateTime.UtcNow.AddMinutes(5), TimeSpan.FromSeconds(5));

        var result = CommsTicketValidator.Validate(ticket, _publicKeyPem, _tenantId, _facilityId);

        result.IsValid.Should().BeTrue();
        result.ErrorMessage.Should().BeNull();
        result.Payload.Should().NotBeNull();
        result.Payload!.Sub.Should().Be(_staffId);
        result.Payload.Name.Should().Be(_displayName);
        result.Payload.TenantId.Should().Be(_tenantId);
        result.Payload.FacilityId.Should().Be(_facilityId);
        result.Payload.BranchId.Should().Be(_branchId);
        result.Payload.Iss.Should().Be(_clientId);
        result.Payload.Permissions.Should().BeEquivalentTo(permissions);
    }

    [Fact]
    public void ExpiredTicket_FailsValidation()
    {
        var (ticket, _) = CommsTicketSigner.IssueTicket(
            _clientId,
            _privateKeyPem,
            _staffId,
            _displayName,
            _tenantId,
            _facilityId,
            _branchId,
            [CommsPermissions.MessagingRead]);

        // Validate 10 minutes in the future
        var future = DateTimeOffset.UtcNow.AddMinutes(10);
        var result = CommsTicketValidator.Validate(ticket, _publicKeyPem, _tenantId, _facilityId, now: future);

        result.IsValid.Should().BeFalse();
        result.ErrorMessage.Should().Contain("expired");
    }

    [Fact]
    public void TicketWithExcessiveLifetime_IsRejected()
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
            Nbf = now.ToUnixTimeSeconds(),
            Exp = now.AddMinutes(15).ToUnixTimeSeconds(), // 15 min > 5 min max
            Jti = Guid.NewGuid().ToString("N")
        };

        var ticket = CommsTicketSigner.Sign(payload, _privateKeyPem);
        var result = CommsTicketValidator.Validate(ticket, _publicKeyPem, _tenantId, _facilityId, now: now);

        result.IsValid.Should().BeFalse();
        result.ErrorMessage.Should().Contain("exceeds maximum 5 minutes");
    }

    [Fact]
    public void BadSignature_OrWrongKey_FailsValidation()
    {
        var (ticket, _) = CommsTicketSigner.IssueTicket(
            _clientId,
            _privateKeyPem,
            _staffId,
            _displayName,
            _tenantId,
            _facilityId,
            _branchId,
            [CommsPermissions.MessagingRead]);

        // Generate different keypair
        using var otherEcdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var otherPublicKeyPem = otherEcdsa.ExportSubjectPublicKeyInfoPem();

        var result = CommsTicketValidator.Validate(ticket, otherPublicKeyPem, _tenantId, _facilityId);

        result.IsValid.Should().BeFalse();
        result.ErrorMessage.Should().Contain("Invalid ticket signature");
    }

    [Fact]
    public void TamperedPayload_FailsValidation()
    {
        var (ticket, _) = CommsTicketSigner.IssueTicket(
            _clientId,
            _privateKeyPem,
            _staffId,
            _displayName,
            _tenantId,
            _facilityId,
            _branchId,
            [CommsPermissions.MessagingRead]);

        var parts = ticket.Split('.');
        var payloadJson = System.Text.Encoding.UTF8.GetString(Base64UrlHelper.Decode(parts[0]));
        var tamperedJson = payloadJson.Replace(_staffId, "attacker-999");
        var tamperedPayloadPart = Base64UrlHelper.Encode(System.Text.Encoding.UTF8.GetBytes(tamperedJson));
        var tamperedTicket = $"{tamperedPayloadPart}.{parts[1]}";

        var result = CommsTicketValidator.Validate(tamperedTicket, _publicKeyPem, _tenantId, _facilityId);

        result.IsValid.Should().BeFalse();
        result.ErrorMessage.Should().Contain("Invalid ticket signature");
    }

    [Fact]
    public void TenantOrFacilityMismatch_FailsValidation()
    {
        var (ticket, _) = CommsTicketSigner.IssueTicket(
            _clientId,
            _privateKeyPem,
            _staffId,
            _displayName,
            _tenantId,
            _facilityId,
            _branchId,
            [CommsPermissions.MessagingRead]);

        var wrongTenantResult = CommsTicketValidator.Validate(ticket, _publicKeyPem, expectedTenantId: "other-tenant", expectedFacilityId: _facilityId);
        wrongTenantResult.IsValid.Should().BeFalse();
        wrongTenantResult.ErrorMessage.Should().Contain("does not match expected 'other-tenant'");

        var wrongFacilityResult = CommsTicketValidator.Validate(ticket, _publicKeyPem, expectedTenantId: _tenantId, expectedFacilityId: "other-facility");
        wrongFacilityResult.IsValid.Should().BeFalse();
        wrongFacilityResult.ErrorMessage.Should().Contain("does not match expected 'other-facility'");
    }

    [Fact]
    public void RevokedSignerKey_IsRejected()
    {
        var (ticket, _) = CommsTicketSigner.IssueTicket(
            _clientId,
            _privateKeyPem,
            _staffId,
            _displayName,
            _tenantId,
            _facilityId,
            _branchId,
            [CommsPermissions.MessagingRead]);

        var revokedSignerKey = new HubSignerKey(
            ClientId: _clientId,
            CellId: "cell-1",
            Service: "clinic",
            Kind: HubClientKind.CloudService,
            PublicKey: _publicKeyPem,
            Revoked: true);

        var result = CommsTicketValidator.ValidateWithKey(ticket, revokedSignerKey, _tenantId, _facilityId);

        result.IsValid.Should().BeFalse();
        result.ErrorMessage.Should().Contain("revoked");
    }

    [Fact]
    public void IssuerMismatchWithSignerKey_IsRejected()
    {
        var (ticket, _) = CommsTicketSigner.IssueTicket(
            _clientId,
            _privateKeyPem,
            _staffId,
            _displayName,
            _tenantId,
            _facilityId,
            _branchId,
            [CommsPermissions.MessagingRead]);

        var differentSignerKey = new HubSignerKey(
            ClientId: "different-client-id",
            CellId: "cell-1",
            Service: "clinic",
            Kind: HubClientKind.CloudService,
            PublicKey: _publicKeyPem,
            Revoked: false);

        var result = CommsTicketValidator.ValidateWithKey(ticket, differentSignerKey, _tenantId, _facilityId);

        result.IsValid.Should().BeFalse();
        result.ErrorMessage.Should().Contain("does not match signer client id");
    }

    [Fact]
    public async Task ValidateAsync_WithHubKeyClient_ValidatesOrRejectsProperly()
    {
        var (ticket, _) = CommsTicketSigner.IssueTicket(
            _clientId,
            _privateKeyPem,
            _staffId,
            _displayName,
            _tenantId,
            _facilityId,
            _branchId,
            [CommsPermissions.MessagingRead]);

        var validKey = new HubSignerKey(_clientId, "cell-1", "clinic", HubClientKind.CloudService, _publicKeyPem, false);
        var mockKeyClient = new MockHubKeyClient(new Dictionary<string, HubSignerKey>
        {
            [_clientId] = validKey
        });

        // Valid resolution
        var validResult = await CommsTicketValidator.ValidateAsync(ticket, mockKeyClient, _tenantId, _facilityId);
        validResult.IsValid.Should().BeTrue();

        // Unknown client
        var unknownKeyClient = new MockHubKeyClient(new Dictionary<string, HubSignerKey>());
        var unknownResult = await CommsTicketValidator.ValidateAsync(ticket, unknownKeyClient, _tenantId, _facilityId);
        unknownResult.IsValid.Should().BeFalse();
        unknownResult.ErrorMessage.Should().Contain("unknown");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("onlyonepart")]
    [InlineData("part1.part2.part3")]
    [InlineData("invalid-b64.invalid-b64")]
    public void MalformedTicketString_IsRejected(string badTicket)
    {
        var result = CommsTicketValidator.Validate(badTicket, _publicKeyPem);
        result.IsValid.Should().BeFalse();
    }

    private sealed class MockHubKeyClient(IReadOnlyDictionary<string, HubSignerKey> keys) : IHubKeyClient
    {
        public Task<HubSignerKey?> GetSignerKeyAsync(string clientId, CancellationToken ct) =>
            Task.FromResult(keys.TryGetValue(clientId, out var key) ? key : null);
    }
}
