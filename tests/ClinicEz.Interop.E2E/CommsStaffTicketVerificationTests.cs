using System;
using System.Threading.Tasks;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.Security;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// E2E Verification for Requirement R1 and Scenario 2:
/// Staff identity comms ticket verification:
/// - Facility services vouch for staff via 5-minute ECDSA signed tickets
/// - comms-api verifies against Hub public keys (GET /v1/keys/{clientId})
/// - Forged, expired, wrong-key, wrong-facility, and revoked-client tickets are refused
/// </summary>
public class CommsStaffTicketVerificationTests
{
    [Fact]
    public async Task ValidTicket_IssuedByClinic_PassesVerificationAgainstHubKeys()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a", "Clinic A"));

        var clientId = HubFixture.ClientId(InteropServices.Clinic);
        var privateKey = HubFixture.SigningKey(InteropServices.Clinic);

        var staffId = Guid.NewGuid().ToString();
        var (ticket, expiresAtUtc) = CommsTicketSigner.IssueTicket(
            clientId: clientId,
            privateKeyPem: privateKey,
            staffId: staffId,
            displayName: "Dr. Alice",
            tenantId: clinic.Tenant,
            facilityId: clinic.FacilityId,
            branchId: "branch-main",
            permissions: [CommsPermissions.MessagingRead, CommsPermissions.MessagingWrite, CommsPermissions.TeleconsultCall]
        );

        ticket.Should().NotBeNullOrWhiteSpace();
        expiresAtUtc.Should().BeAfter(DateTime.UtcNow);

        // Verify using the real Hub key client
        var keyClient = cell.Hub.NewKeyClient();
        var result = await CommsTicketValidator.ValidateAsync(
            ticket: ticket,
            keyClient: keyClient,
            expectedTenantId: clinic.Tenant,
            expectedFacilityId: clinic.FacilityId
        );

        result.IsValid.Should().BeTrue(result.ErrorMessage);
        result.Payload.Should().NotBeNull();
        result.Payload!.Sub.Should().Be(staffId);
        result.Payload.Name.Should().Be("Dr. Alice");
        result.Payload.TenantId.Should().Be(clinic.Tenant);
        result.Payload.FacilityId.Should().Be(clinic.FacilityId);
        result.Payload.BranchId.Should().Be("branch-main");
        result.Payload.Permissions.Should().Contain([CommsPermissions.MessagingRead, CommsPermissions.MessagingWrite, CommsPermissions.TeleconsultCall]);
    }

    [Fact]
    public async Task Ticket_WithTamperedPayload_FailsVerification()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));

        var clientId = HubFixture.ClientId(InteropServices.Clinic);
        var privateKey = HubFixture.SigningKey(InteropServices.Clinic);

        var (ticket, _) = CommsTicketSigner.IssueTicket(
            clientId: clientId,
            privateKeyPem: privateKey,
            staffId: Guid.NewGuid().ToString(),
            displayName: "Dr. Alice",
            tenantId: clinic.Tenant,
            facilityId: clinic.FacilityId,
            branchId: null,
            permissions: [CommsPermissions.MessagingRead]
        );

        // Tamper with the payload: change permission to include TeleconsultRecord
        var parts = ticket.Split('.');
        var payloadBytes = Base64UrlHelper.Decode(parts[0]);
        var json = System.Text.Encoding.UTF8.GetString(payloadBytes);
        var tamperedJson = json.Replace("messaging:read", "messaging:triage\", \"teleconsult:record");
        var tamperedPayloadPart = Base64UrlHelper.Encode(System.Text.Encoding.UTF8.GetBytes(tamperedJson));
        var tamperedTicket = $"{tamperedPayloadPart}.{parts[1]}";

        var keyClient = cell.Hub.NewKeyClient();
        var result = await CommsTicketValidator.ValidateAsync(tamperedTicket, keyClient, clinic.Tenant, clinic.FacilityId);

        result.IsValid.Should().BeFalse();
        result.ErrorMessage.Should().Contain("Invalid ticket signature");
    }

    [Fact]
    public async Task Ticket_Expired_IsRejected()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));

        var clientId = HubFixture.ClientId(InteropServices.Clinic);
        var privateKey = HubFixture.SigningKey(InteropServices.Clinic);

        var (ticket, _) = CommsTicketSigner.IssueTicket(
            clientId: clientId,
            privateKeyPem: privateKey,
            staffId: Guid.NewGuid().ToString(),
            displayName: "Dr. Alice",
            tenantId: clinic.Tenant,
            facilityId: clinic.FacilityId,
            branchId: null,
            permissions: [CommsPermissions.MessagingRead],
            lifetime: TimeSpan.FromMinutes(1)
        );

        // Validate at a future time past expiration (> 5 minutes + clock skew)
        var simulatedFuture = DateTimeOffset.UtcNow.AddMinutes(10);
        var keyClient = cell.Hub.NewKeyClient();
        var result = await CommsTicketValidator.ValidateAsync(
            ticket, keyClient, clinic.Tenant, clinic.FacilityId, now: simulatedFuture);

        result.IsValid.Should().BeFalse();
        result.ErrorMessage.Should().Contain("expired");
    }

    [Fact]
    public async Task Ticket_FromUnknownOrWrongClient_IsRejected()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));

        var (unregisteredPriv, _) = PemKey.GenerateP256Base64();
        var (ticket, _) = CommsTicketSigner.IssueTicket(
            clientId: "e2e-fake-unregistered-client",
            privateKeyPem: unregisteredPriv,
            staffId: Guid.NewGuid().ToString(),
            displayName: "Hacker Eve",
            tenantId: clinic.Tenant,
            facilityId: clinic.FacilityId,
            branchId: null,
            permissions: [CommsPermissions.MessagingTriage]
        );

        var keyClient = cell.Hub.NewKeyClient();
        var result = await CommsTicketValidator.ValidateAsync(ticket, keyClient, clinic.Tenant, clinic.FacilityId);

        result.IsValid.Should().BeFalse();
        result.ErrorMessage.Should().Contain("unknown to the hub");
    }

    [Fact]
    public async Task Ticket_FromRevokedClient_IsRejected()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));

        var clientId = HubFixture.ClientId(InteropServices.Pharmacy);
        var privateKey = HubFixture.SigningKey(InteropServices.Pharmacy);

        var (ticket, _) = CommsTicketSigner.IssueTicket(
            clientId: clientId,
            privateKeyPem: privateKey,
            staffId: Guid.NewGuid().ToString(),
            displayName: "Pharmacist Bob",
            tenantId: clinic.Tenant,
            facilityId: clinic.FacilityId,
            branchId: null,
            permissions: [CommsPermissions.MessagingRead]
        );

        // Mark pharmacy client as revoked in the hub database
        await cell.Hub.DbAsync(async db =>
        {
            var client = await db.Clients.SingleAsync(c => c.ClientId == clientId);
            client.Revoked = true;
            await db.SaveChangesAsync();
            return true;
        });

        var keyClient = cell.Hub.NewKeyClient();
        var result = await CommsTicketValidator.ValidateAsync(ticket, keyClient, clinic.Tenant, clinic.FacilityId);

        result.IsValid.Should().BeFalse();
        result.ErrorMessage.Should().Contain("revoked");
    }

    [Fact]
    public async Task Ticket_ForDifferentFacilityOrTenant_IsRejected()
    {
        await using var cell = new TestCell();
        var clinicA = await cell.ProvisionAsync(Fac.Clinic("tenant-a", "Clinic A"));
        var clinicB = await cell.ProvisionAsync(Fac.Clinic("tenant-b", "Clinic B"));

        var clientId = HubFixture.ClientId(InteropServices.Clinic);
        var privateKey = HubFixture.SigningKey(InteropServices.Clinic);

        // Ticket issued for Clinic A
        var (ticket, _) = CommsTicketSigner.IssueTicket(
            clientId: clientId,
            privateKeyPem: privateKey,
            staffId: Guid.NewGuid().ToString(),
            displayName: "Dr. Alice",
            tenantId: clinicA.Tenant,
            facilityId: clinicA.FacilityId,
            branchId: null,
            permissions: [CommsPermissions.MessagingRead]
        );

        var keyClient = cell.Hub.NewKeyClient();

        // Attempt to validate against Clinic B's expected facility/tenant
        var facilityMismatch = await CommsTicketValidator.ValidateAsync(
            ticket, keyClient, expectedTenantId: clinicA.Tenant, expectedFacilityId: clinicB.FacilityId);
        facilityMismatch.IsValid.Should().BeFalse();
        facilityMismatch.ErrorMessage.Should().Contain("facility");

        var tenantMismatch = await CommsTicketValidator.ValidateAsync(
            ticket, keyClient, expectedTenantId: clinicB.Tenant, expectedFacilityId: clinicA.FacilityId);
        tenantMismatch.IsValid.Should().BeFalse();
        tenantMismatch.ErrorMessage.Should().Contain("tenant");
    }
}
