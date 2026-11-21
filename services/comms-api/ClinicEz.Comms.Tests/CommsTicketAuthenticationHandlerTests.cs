using System;
using System.Security.Cryptography;
using ClinicEz.Shared.Security;
using Xunit;

namespace ClinicEz.Comms.Tests;

public class CommsTicketAuthenticationHandlerTests
{
    private static (string PrivateKeyPem, string PublicKeyPem) GenerateEcdsaKeyPair()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var priv = ecdsa.ExportECPrivateKeyPem();
        var pub = ecdsa.ExportSubjectPublicKeyInfoPem();
        return (priv, pub);
    }

    [Fact]
    public void CommsTicket_IssueAndValidate_Succeeds()
    {
        var (priv, pub) = GenerateEcdsaKeyPair();

        var (ticket, expiresAtUtc) = CommsTicketSigner.IssueTicket(
            clientId: "clinic-test-01",
            privateKeyPem: priv,
            staffId: "staff-100",
            displayName: "Dr. Alice",
            tenantId: "tenant-abc",
            facilityId: "fac-xyz",
            branchId: "branch-1",
            permissions: [CommsPermissions.MessagingRead, CommsPermissions.MessagingWrite]);

        Assert.NotEmpty(ticket);
        Assert.True(expiresAtUtc > DateTime.UtcNow);

        var result = CommsTicketValidator.Validate(ticket, pub, "tenant-abc", "fac-xyz");

        Assert.True(result.IsValid);
        Assert.NotNull(result.Payload);
        Assert.Equal("staff-100", result.Payload.Sub);
        Assert.Equal("Dr. Alice", result.Payload.Name);
        Assert.Equal("tenant-abc", result.Payload.TenantId);
        Assert.Equal("fac-xyz", result.Payload.FacilityId);
        Assert.Equal("branch-1", result.Payload.BranchId);
        Assert.Contains(CommsPermissions.MessagingRead, result.Payload.Permissions);
    }

    [Fact]
    public void CommsTicket_TamperedSignature_Fails()
    {
        var (priv, pub) = GenerateEcdsaKeyPair();

        var (ticket, _) = CommsTicketSigner.IssueTicket(
            clientId: "clinic-test-01",
            privateKeyPem: priv,
            staffId: "staff-100",
            displayName: "Dr. Alice",
            tenantId: "tenant-abc",
            facilityId: "fac-xyz",
            branchId: null,
            permissions: [CommsPermissions.MessagingRead]);

        // Tamper signature segment
        var parts = ticket.Split('.');
        var tampered = parts[0] + ".AAAAAA" + parts[1][6..];

        var result = CommsTicketValidator.Validate(tampered, pub, "tenant-abc", "fac-xyz");
        Assert.False(result.IsValid);
    }

    [Fact]
    public void CommsTicket_WrongPublicKey_Fails()
    {
        var (priv, _) = GenerateEcdsaKeyPair();
        var (_, wrongPub) = GenerateEcdsaKeyPair();

        var (ticket, _) = CommsTicketSigner.IssueTicket(
            clientId: "clinic-test-01",
            privateKeyPem: priv,
            staffId: "staff-100",
            displayName: "Dr. Alice",
            tenantId: "tenant-abc",
            facilityId: "fac-xyz",
            branchId: null,
            permissions: [CommsPermissions.MessagingRead]);

        var result = CommsTicketValidator.Validate(ticket, wrongPub, "tenant-abc", "fac-xyz");
        Assert.False(result.IsValid);
    }

    [Fact]
    public void CommsTicket_MaxLifetimeCappedAt5Minutes()
    {
        var (priv, pub) = GenerateEcdsaKeyPair();

        // Request 10 minute lifetime
        var (ticket, expiresAtUtc) = CommsTicketSigner.IssueTicket(
            clientId: "clinic-test-01",
            privateKeyPem: priv,
            staffId: "staff-100",
            displayName: "Dr. Alice",
            tenantId: "tenant-abc",
            facilityId: "fac-xyz",
            branchId: null,
            permissions: [CommsPermissions.MessagingRead],
            lifetime: TimeSpan.FromMinutes(10));

        // Must be capped at 5 minutes
        Assert.True(expiresAtUtc <= DateTime.UtcNow.AddMinutes(5).AddSeconds(2));

        var result = CommsTicketValidator.Validate(ticket, pub, "tenant-abc", "fac-xyz");
        Assert.True(result.IsValid);
    }
}
