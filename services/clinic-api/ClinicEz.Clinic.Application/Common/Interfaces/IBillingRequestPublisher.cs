using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

/// <summary>
/// Asks the shared billing counter for an invoice (<c>billing.invoice.requested</c>). Queued in the interop outbox, so the
/// caller invokes it before its own <c>SaveChanges</c>. Skipped when this clinic is not provisioned on this server.
/// </summary>
public interface IBillingRequestPublisher
{
    /// <returns>False when the clinic identity is unknown (nothing queued).</returns>
    Task<bool> PublishInvoiceRequestedAsync(BillingInvoiceRequestedPayload request, CancellationToken ct);
}

/// <summary>
/// Reads a patient's shared record from the patient plane. <see cref="RequestRedeemAsync"/> records a pending import and
/// queues <c>patient.share.redeem</c> in the same unit of work; the answer arrives later as <c>patient.share.snapshot</c>.
/// </summary>
public interface IPatientRecordGateway
{
    /// <returns>The request id (also the interop correlation id) to poll for the import status.</returns>
    Task<Guid> RequestRedeemAsync(PatientShareRedeemInput input, CancellationToken ct);
}

/// <summary>
/// What staff entered to read a shared record: a scanned <see cref="ShareToken"/>, or the patient's
/// <see cref="ClinicEzId"/> with the one-time <see cref="Code"/> they read out (<see cref="ShareToken"/> then empty).
/// </summary>
public sealed record PatientShareRedeemInput(
    string ShareToken,
    string? ClinicEzId,
    string? Code,
    string Purpose,
    bool AddToQueue,
    string? ChiefComplaint);
