using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Transport;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Envelope signing end to end. Every service signs what it sends with its own key and the hub verifies it before the message
/// is stored; every receiving service verifies it again against the key the hub publishes before any handler runs, so a message
/// changed on the way in, or while it waited in the mailbox, never reaches a business rule.
/// </summary>
public class EnvelopeSigningTests
{
    private const string Clinic = InteropServices.Clinic;

    public static TheoryData<string> Cases => new()
    {
        "payload changed after signing",
        "recipient changed after signing",
        "signature of another client's key",
        "signer key id of another client",
        "no signature"
    };

    [Fact]
    public async Task ASignedEnvelope_IsAcceptedAndStoredByTheHub()
    {
        await using var cell = new TestCell();
        var (clinic, lab) = await ProvisionAsync(cell);

        var envelope = Signed(NewOrder(clinic, lab), Clinic);
        var results = await cell.Hub.NewSdk(Clinic, sign: false).SendAsync([envelope], CancellationToken.None);

        results.Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted, results[0].Reason);
        (await StoredAsync(cell, envelope.MessageId)).Should().Be(1);
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public async Task ATamperedOrUnsignedEnvelope_IsRefusedByTheHubAndNeverStored(string tampering)
    {
        await using var cell = new TestCell();
        var (clinic, lab) = await ProvisionAsync(cell);
        var other = await cell.ProvisionAsync(Fac.Pharmacy("tenant-a", "Other"));

        var signed = Signed(NewOrder(clinic, lab), Clinic);
        var (envelope, expected) = tampering switch
        {
            "payload changed after signing" => (signed with { Payload = NewOrder(clinic, lab, quantity: 9999).Payload }, "invalid_signature"),
            "recipient changed after signing" => (signed with { To = other.Party }, "invalid_signature"),
            "signature of another client's key" => (Signed(NewOrder(clinic, lab), InteropServices.Laboratory) with { SignerKeyId = HubFixture.ClientId(Clinic) }, "invalid_signature"),
            "signer key id of another client" => (Signed(NewOrder(clinic, lab), InteropServices.Laboratory), "invalid_signature"),
            "no signature" => (NewOrder(clinic, lab), "signature_required"),
            _ => throw new ArgumentOutOfRangeException(nameof(tampering), tampering, null)
        };

        var results = await cell.Hub.NewSdk(Clinic, sign: false).SendAsync([envelope], CancellationToken.None);

        var result = results.Should().ContainSingle().Subject;
        result.Status.Should().Be(SendResult.Rejected, result.Reason);
        result.Reason.Should().Contain(expected);
        (await StoredAsync(cell, envelope.MessageId)).Should().Be(0, "a refused message is never stored for delivery");
        (await cell.Lab.PollOnceAsync()).Should().Be(0, "nothing was delivered to the laboratory");
    }

    [Fact]
    public async Task AMessageChangedInTheMailbox_IsRejectedByTheReceiver_AndDeliveredOnceRestored()
    {
        await using var cell = new TestCell();
        var (clinic, lab) = await ProvisionAsync(cell);
        await LabSeed.PriceAsync(cell.Lab, lab, LabOrderJourney.Test, LabOrderJourney.Price);
        var patient = await ClinicSeed.PatientAsync(cell.Clinic, clinic, syncPatientId: null);
        var doctor = await ClinicSeed.DoctorAsync(cell.Clinic, clinic);

        await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new CreateClinicLabOrderCommand(
            patient.Id,
            $"{patient.FirstName} {patient.LastName}",
            OrderedByDoctorId: doctor.Id,
            OrderedByDoctorName: "Dr. Ana Cruz",
            ClinicalDiagnosis: "Fever",
            Items: [new CreateLabOrderItemRequest(LabOrderJourney.Test, "Hematology", null)],
            TargetFacilityId: lab.FacilityId,
            TargetTenantId: lab.Tenant));
        (await cell.Clinic.RelayOnceAsync()).Should().BeGreaterThan(0);

        var original = await cell.Hub.DbAsync(db => db.Messages.AsNoTracking().Where(m => m.Type == InteropTypes.LabOrderIssued).Select(m => m.Envelope).SingleAsync());
        original.Should().Contain("Fever", "the test edits the stored envelope, so it must be readable at rest");
        await SetStoredEnvelopeAsync(cell, original.Replace("Fever", "Cancer"));

        await cell.Lab.PollOnceAsync();

        (await cell.Lab.DbAsync(db => db.LabRequisitions.IgnoreQueryFilters().CountAsync())).Should().Be(0, "the handler never ran for an envelope that no longer matches its signature");
        var parked = await cell.Hub.DbAsync(db => db.Messages.AsNoTracking().SingleAsync(m => m.Type == InteropTypes.LabOrderIssued));
        parked.AttemptCount.Should().BeGreaterThan(0);
        parked.LastError.Should().Contain("invalid_signature");
        parked.AckedAtUtc.Should().BeNull();

        await SetStoredEnvelopeAsync(cell, original);
        await cell.PumpAsync();

        (await cell.Lab.DbAsync(db => db.LabRequisitions.IgnoreQueryFilters().CountAsync())).Should().Be(1);
        await cell.Clinic.AssertNothingStuckAsync();
    }

    private static async Task<(Fac Clinic, Fac Lab)> ProvisionAsync(TestCell cell) =>
        (await cell.ProvisionAsync(Fac.Clinic("tenant-a")), await cell.ProvisionAsync(Fac.Lab("tenant-a")));

    private static InteropEnvelope NewOrder(Fac clinic, Fac lab, int quantity = 1) =>
        InteropEnvelope.Create(InteropTypes.LabOrderIssued, clinic.Party, lab.Party, Guid.NewGuid(), new { Quantity = quantity });

    private static InteropEnvelope Signed(InteropEnvelope envelope, string service) =>
        new EnvelopeSigner(HubFixture.SigningKey(service), HubFixture.ClientId(service)).Sign(envelope);

    private static Task<int> StoredAsync(TestCell cell, Guid messageId) =>
        cell.Hub.DbAsync(db => db.Messages.CountAsync(m => m.MessageId == messageId));

    private static Task SetStoredEnvelopeAsync(TestCell cell, string json) => cell.Hub.DbAsync(async db =>
    {
        var message = await db.Messages.SingleAsync(m => m.Type == InteropTypes.LabOrderIssued);
        message.Envelope = json;
        await db.SaveChangesAsync();
        return 0;
    });
}
