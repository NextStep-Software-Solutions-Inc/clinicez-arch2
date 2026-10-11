using ClinicEz.Interop.E2E.Support;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Flow G: the transport is at-least-once, so every consumer must turn a repeated delivery into the same single effect,
/// whether the repetition is the same envelope or a fresh envelope for the same business event.
/// </summary>
public class IdempotencyTests
{
    [Fact]
    public async Task LabOrder_SentTwiceThroughTheHub_IsStoredOnceAndWorkedOnce()
    {
        var (cell, _, lab, journey, order) = await OrderedAsync();
        await using var _ = cell;
        var original = await OrderEnvelopeAsync(cell);

        var results = await cell.Hub.NewSdk(InteropServices.Clinic).SendAsync([original], CancellationToken.None);
        await cell.PumpAsync();

        results.Should().ContainSingle().Which.Status.Should().Be(SendResult.Duplicate);
        await AssertSingleEffectAsync(cell, lab, journey, order.Id);
        (await cell.Lab.InboxAsync()).Count(m => m.Type == InteropTypes.LabOrderIssued).Should().Be(1);
    }

    [Fact]
    public async Task LabOrder_RedeliveredToTheLabByTheDispatcher_IsRecognisedAsADuplicate()
    {
        var (cell, _, lab, journey, order) = await OrderedAsync();
        await using var _ = cell;
        var original = await OrderEnvelopeAsync(cell);
        var labOutboxBefore = (await cell.Lab.OutboxAsync()).Count;

        var result = await cell.Lab.Dispatcher.DispatchAsync(original, CancellationToken.None);
        await cell.PumpAsync();

        result.Outcome.Should().Be(DispatchOutcome.Duplicate);
        (await cell.Lab.OutboxAsync()).Should().HaveCount(labOutboxBefore, "a duplicate must not queue a second set of replies");
        await AssertSingleEffectAsync(cell, lab, journey, order.Id);
    }

    [Fact]
    public async Task LabOrder_ResentWithANewMessageId_StillCreatesOneRequisitionAndOneInvoice()
    {
        var (cell, clinic, lab, journey, order) = await OrderedAsync();
        await using var _ = cell;
        var original = await OrderEnvelopeAsync(cell);
        var resend = InteropEnvelope.Create(
            InteropTypes.LabOrderIssued, clinic.Party, lab.Party, original.CorrelationId, original.GetPayload<LabRequisitionIssuedEvent>());

        var results = await cell.Hub.NewSdk(InteropServices.Clinic).SendAsync([resend], CancellationToken.None);
        await cell.PumpAsync();

        results.Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted);
        await AssertSingleEffectAsync(cell, lab, journey, order.Id);
    }

    [Fact]
    public async Task PaymentConfirmation_ReplayedToTheLab_HasNoSecondEffect()
    {
        var (cell, _, lab, journey, order) = await OrderedAsync();
        await using var _ = cell;
        var requisition = await LabSeed.RequisitionAsync(cell.Lab, lab, order.Id);
        await journey.PayAtCashierAsync(requisition.Id);
        var confirmation = (await cell.Billing.SentAsync()).Single(m => m.Type == InteropTypes.BillingPaymentConfirmed).Envelope;
        var labOutboxBefore = (await cell.Lab.OutboxAsync()).Count;

        var result = await cell.Lab.Dispatcher.DispatchAsync(confirmation, CancellationToken.None);
        await cell.PumpAsync();

        result.Outcome.Should().Be(DispatchOutcome.Duplicate);
        (await cell.Lab.OutboxAsync()).Should().HaveCount(labOutboxBefore);
        (await LabSeed.RequisitionAsync(cell.Lab, lab, order.Id)).Stage.Should().Be(RequisitionStage.Paid);
        (await journey.ClinicOrderAsync(order.Id)).Stage.Should().Be(LabOrderStage.Paid);
    }

    private static async Task<(TestCell Cell, Fac Clinic, Fac Lab, LabOrderJourney Journey, ClinicEz.Clinic.Application.Features.LabOrders.DTOs.ClinicLabOrderDto Order)> OrderedAsync()
    {
        var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));
        var lab = await cell.ProvisionAsync(Fac.Lab("tenant-a"));
        await LabSeed.PriceAsync(cell.Lab, lab, LabOrderJourney.Test, LabOrderJourney.Price);
        var patient = await ClinicSeed.PatientAsync(cell.Clinic, clinic, syncPatientId: null);
        var doctor = await ClinicSeed.DoctorAsync(cell.Clinic, clinic);
        var journey = new LabOrderJourney(cell, clinic, lab);
        return (cell, clinic, lab, journey, await journey.OrderAsync(patient, doctor, lab));
    }

    private static async Task<InteropEnvelope> OrderEnvelopeAsync(TestCell cell) =>
        (await cell.Clinic.SentAsync()).Single(m => m.Type == InteropTypes.LabOrderIssued).Envelope;

    private static async Task AssertSingleEffectAsync(TestCell cell, Fac lab, LabOrderJourney journey, Guid orderId)
    {
        var requisition = await LabSeed.RequisitionAsync(cell.Lab, lab, orderId);
        (await cell.Lab.DbAsync(db => db.LabRequisitions.IgnoreQueryFilters().CountAsync())).Should().Be(1);
        (await cell.Billing.DbAsync(db => db.Invoices.IgnoreQueryFilters().CountAsync())).Should().Be(1);
        (await cell.Billing.InvoiceForAsync(lab, requisition.Id)).Total.Should().Be(LabOrderJourney.Price);
        (await journey.ClinicOrderAsync(orderId)).Stage.Should().Be(LabOrderStage.AwaitingPayment);
    }
}
