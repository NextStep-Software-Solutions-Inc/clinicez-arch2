using System;
using System.Linq;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Laboratory.Application.Tests;

/// <summary>
/// <c>lab.result.reviewed</c>: the ordering doctor's verdict arriving at the laboratory, driven through the real
/// dispatcher, the handler and an in-memory database.
/// </summary>
public class LabResultReviewedTests
{
    private static readonly DateTime ReviewedAt = new(2026, 10, 9, 8, 0, 0, DateTimeKind.Utc);

    private static InteropEnvelope ReviewEnvelope(
        Guid correlationId,
        VerificationState state = VerificationState.Verified,
        Party? from = null,
        Party? to = null,
        DateTime? reviewedAtUtc = null,
        Guid? payloadRequisitionId = null,
        string reviewer = "Dr. Alice Tan") =>
        InteropEnvelope.Create(
            InteropTypes.LabResultReviewed,
            from ?? LabInteropTestData.ClinicA,
            to ?? LabInteropTestData.Lab,
            correlationId,
            new LabResultReviewedPayload
            {
                RequisitionId = payloadRequisitionId ?? correlationId,
                State = state,
                ReviewedByName = reviewer,
                ReviewedByPrc = "PRC-0012345",
                Remarks = "Looks consistent with the clinical picture.",
                ReviewedAtUtc = reviewedAtUtc ?? ReviewedAt
            });

    [Theory]
    [InlineData(VerificationState.Verified, DoctorReviewOutcome.Accepted)]
    [InlineData(VerificationState.Rejected, DoctorReviewOutcome.Rejected)]
    public async Task A_verdict_from_the_ordering_clinic_is_recorded_without_touching_the_order(
        VerificationState state, DoctorReviewOutcome expected)
    {
        using var host = new LabInteropHost();
        var order = await LabPaymentGateTests.OrderAsync(host, PaymentPolicy.None);
        var outbox = (await host.OutboxAsync()).Count;

        var result = await host.Dispatcher.DispatchAsync(ReviewEnvelope(order.CorrelationId!.Value, state), default);

        result.Outcome.Should().Be(DispatchOutcome.Handled);
        var reviewed = (await host.RequisitionsAsync()).Single();
        reviewed.DoctorReviewOutcome.Should().Be(expected);
        reviewed.DoctorReviewedAtUtc.Should().Be(ReviewedAt);
        reviewed.DoctorReviewedByName.Should().Be("Dr. Alice Tan");
        reviewed.DoctorReviewedByPrc.Should().Be("PRC-0012345");
        reviewed.DoctorReviewRemarks.Should().Be("Looks consistent with the clinical picture.");
        reviewed.Stage.Should().Be(order.Stage);
        (await host.OutboxAsync()).Should().HaveCount(outbox, "a review is recorded, not announced again");
    }

    [Fact]
    public async Task Redelivery_and_an_older_verdict_change_nothing_but_a_newer_one_replaces_it()
    {
        using var host = new LabInteropHost();
        var order = await LabPaymentGateTests.OrderAsync(host, PaymentPolicy.None);
        var correlationId = order.CorrelationId!.Value;

        await host.Dispatcher.DispatchAsync(ReviewEnvelope(correlationId, VerificationState.Verified), default);
        await host.Dispatcher.DispatchAsync(ReviewEnvelope(correlationId, VerificationState.Verified), default);
        await host.Dispatcher.DispatchAsync(
            ReviewEnvelope(correlationId, VerificationState.Rejected, reviewedAtUtc: ReviewedAt.AddMinutes(-5), reviewer: "Dr. Early"), default);

        var recorded = (await host.RequisitionsAsync()).Single();
        recorded.DoctorReviewOutcome.Should().Be(DoctorReviewOutcome.Accepted);
        recorded.DoctorReviewedByName.Should().Be("Dr. Alice Tan");

        await host.Dispatcher.DispatchAsync(
            ReviewEnvelope(correlationId, VerificationState.Rejected, reviewedAtUtc: ReviewedAt.AddMinutes(5), reviewer: "Dr. Later"), default);

        var replaced = (await host.RequisitionsAsync()).Single();
        replaced.DoctorReviewOutcome.Should().Be(DoctorReviewOutcome.Rejected);
        replaced.DoctorReviewedByName.Should().Be("Dr. Later");
    }

    [Fact]
    public async Task Verdicts_that_are_not_from_the_ordering_clinic_or_not_a_decision_are_acknowledged_and_ignored()
    {
        using var host = new LabInteropHost();
        var order = await LabPaymentGateTests.OrderAsync(host, PaymentPolicy.None);
        var correlationId = order.CorrelationId!.Value;
        var sameTenantOtherClinic = Party.ForFacility("tenant-a", Guid.NewGuid().ToString(), FacilityType.Clinic);

        var envelopes = new[]
        {
            ReviewEnvelope(correlationId, from: LabInteropTestData.ClinicB),
            ReviewEnvelope(correlationId, from: sameTenantOtherClinic),
            ReviewEnvelope(correlationId, from: LabInteropTestData.LabBilling),
            ReviewEnvelope(correlationId, from: Party.ForPatient(Guid.NewGuid().ToString())),
            ReviewEnvelope(correlationId, to: Party.ForPatient(Guid.NewGuid().ToString())),
            ReviewEnvelope(correlationId, to: Party.ForFacility(LabInteropTestData.LabTenant, LabInteropTestData.LabId.ToString(), FacilityType.Clinic)),
            ReviewEnvelope(correlationId, state: VerificationState.Unverified),
            ReviewEnvelope(correlationId, payloadRequisitionId: Guid.NewGuid()),
            ReviewEnvelope(Guid.NewGuid())
        };

        foreach (var envelope in envelopes)
        {
            (await host.Dispatcher.DispatchAsync(envelope, default)).ShouldAck.Should().BeTrue();
        }

        var unchanged = (await host.RequisitionsAsync()).Single();
        unchanged.DoctorReviewOutcome.Should().Be(DoctorReviewOutcome.None);
        unchanged.DoctorReviewedAtUtc.Should().BeNull();
    }

    [Fact]
    public async Task A_verdict_addressed_to_another_tenants_laboratory_never_touches_this_laboratorys_order()
    {
        using var host = new LabInteropHost();
        var order = await LabPaymentGateTests.OrderAsync(host, PaymentPolicy.None);
        await host.WithDbAsync(async db =>
        {
            await LabInteropTestData.SeedLabAsync(db, PaymentPolicy.None, LabInteropTestData.OtherLabTenant, LabInteropTestData.OtherLabId, "Other Laboratory");
            return 0;
        });

        var result = await host.Dispatcher.DispatchAsync(
            ReviewEnvelope(order.CorrelationId!.Value, to: LabInteropTestData.OtherLab), default);

        result.ShouldAck.Should().BeTrue();
        (await host.RequisitionsAsync()).Single().DoctorReviewOutcome.Should().Be(DoctorReviewOutcome.None);
    }
}
