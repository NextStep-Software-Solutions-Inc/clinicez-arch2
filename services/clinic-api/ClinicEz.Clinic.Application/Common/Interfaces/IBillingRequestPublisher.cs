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
    Task<Guid> RequestRedeemAsync(string shareToken, string purpose, bool addToQueue, string? chiefComplaint, CancellationToken ct);
}
