using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

/// <summary>
/// Queues <c>lab.order.issued</c> in the interop outbox, addressed to the requisition's target laboratory. Call it
/// BEFORE the caller's <c>SaveChanges</c> so the message commits atomically with the order. Failures throw: nothing is
/// swallowed.
/// </summary>
public interface ILabRequisitionPublisher
{
    void PublishRequisitionIssued(LabRequisitionIssuedEvent requisitionEvent);
}
