using ClinicEz.Interop.E2E.Support;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Flow D: the hub, not the receiving service, is what keeps one tenant out of another's facilities. A routed order that the
/// directory does not allow is refused, parked as dead-lettered in the sender's outbox, and creates nothing at the target.
/// </summary>
public class CrossTenantDenialTests
{
    [Theory]
    [InlineData(FacilityVisibility.Private, null)]
    [InlineData(FacilityVisibility.Network, null)]
    [InlineData(FacilityVisibility.Network, LinkScopes.Prescription)]
    public async Task RoutedOrder_ToAnotherTenantsLab_IsRefusedByTheHubAndCreatesNothing(FacilityVisibility visibility, LinkScopes? linkedScopes)
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));
        var lab = await cell.ProvisionAsync(Fac.Lab("tenant-b"), visibility);
        if (linkedScopes is { } scopes) await cell.Hub.UpsertLinkAsync(clinic.Party, lab.Party, scopes);
        await LabSeed.PriceAsync(cell.Lab, lab, LabOrderJourney.Test, LabOrderJourney.Price);
        var patient = await ClinicSeed.PatientAsync(cell.Clinic, clinic, syncPatientId: null);
        var doctor = await ClinicSeed.DoctorAsync(cell.Clinic, clinic);

        var order = await new LabOrderJourney(cell, clinic, lab).OrderAsync(patient, doctor, lab);

        var sent = (await cell.Clinic.SentAsync()).Single(m => m.Type == InteropTypes.LabOrderIssued);
        sent.DeadLettered.Should().BeTrue("the hub refused the message, so the relay parks it instead of retrying forever");
        sent.Dispatched.Should().BeFalse();
        sent.Error.Should().NotBeNullOrWhiteSpace();

        (await cell.Lab.DbAsync(db => db.LabRequisitions.IgnoreQueryFilters().CountAsync())).Should().Be(0);
        (await cell.Lab.InboxAsync()).Should().NotContain(m => m.Type == InteropTypes.LabOrderIssued);
        (await cell.Billing.DbAsync(db => db.Invoices.IgnoreQueryFilters().CountAsync())).Should().Be(0);
        (await cell.Hub.DbAsync(db => db.Messages.CountAsync(m => m.Type == InteropTypes.LabOrderIssued))).Should().Be(0, "a refused message is never stored for delivery");
        order.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task RoutedOrder_ToAnotherTenantsLab_WithAMatchingLink_IsDelivered()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));
        var lab = await cell.ProvisionAsync(Fac.Lab("tenant-b"), FacilityVisibility.Network);
        await cell.Hub.UpsertLinkAsync(clinic.Party, lab.Party, LinkScopes.LabOrder);
        var patient = await ClinicSeed.PatientAsync(cell.Clinic, clinic, syncPatientId: null);
        var doctor = await ClinicSeed.DoctorAsync(cell.Clinic, clinic);

        await new LabOrderJourney(cell, clinic, lab).OrderAsync(patient, doctor, lab);

        (await cell.Lab.DbAsync(db => db.LabRequisitions.IgnoreQueryFilters().CountAsync())).Should().Be(1);
        await cell.Clinic.AssertNothingStuckAsync();
    }
}
