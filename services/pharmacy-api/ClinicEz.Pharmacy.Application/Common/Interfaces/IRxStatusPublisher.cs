using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Pharmacy.Application.Common.Interfaces;

public interface IRxStatusPublisher
{
    /// <summary>
    /// Queues <c>rx.status.changed</c> in the transactional outbox for the ordering clinic and, when the patient is a
    /// ClinicEZ patient, for <c>Party.ForPatient</c>. Call BEFORE the <c>SaveChanges</c> that commits the transition so the
    /// messages and the state change are atomic. Throws if the order cannot be addressed; never swallows failures.
    /// </summary>
    void EnqueueStatusChanged(PrescriptionOrder order, RxStage stage, string? reason = null);
}

public interface IPharmacyBillingPublisher
{
    /// <summary>
    /// Queues <c>billing.invoice.requested</c> to this pharmacy's billing service for the order's accepted items.
    /// The invoice request id is the pharmacy order id, so re-sending replaces the lines while unpaid.
    /// </summary>
    void EnqueueInvoiceRequest(PrescriptionOrder order);
}
