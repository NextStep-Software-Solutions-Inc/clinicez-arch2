using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Pharmacy.Application.Common.Interfaces;

public interface IPrescriptionDispensedPublisher
{
    /// <summary>
    /// Queues <c>rx.dispensed</c> in the transactional outbox, addressed to the clinic that ordered <paramref name="order"/>.
    /// Must be called BEFORE the dispensing <c>SaveChanges</c> so the message and the stock/order changes commit atomically.
    /// Throws if the order cannot be addressed; never swallows failures.
    /// </summary>
    void Enqueue(PrescriptionOrder order, PrescriptionDispensedEvent dispensedEvent);
}
