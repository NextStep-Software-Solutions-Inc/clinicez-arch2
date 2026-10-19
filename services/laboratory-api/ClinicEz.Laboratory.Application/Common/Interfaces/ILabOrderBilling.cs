using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Laboratory.Application.Common.Interfaces;

/// <summary>Quotes an order from the laboratory's own catalogue and asks billing to invoice it.</summary>
public interface ILabOrderBilling
{
    /// <summary>
    /// Prices the requested tests from the catalogue of the order's laboratory, stores the quote on the requisition and
    /// queues <c>billing.invoice.requested</c>. Does nothing when the order's payment policy is
    /// <see cref="Domain.Enums.PaymentPolicy.None"/>.
    /// </summary>
    Task RequestInvoiceAsync(LabRequisition requisition, IReadOnlyCollection<RequisitionItemDto> items, CancellationToken ct);

    /// <summary>
    /// Re-prices the stored quote lines against the current catalogue and asks billing again (same invoice request id, so
    /// billing replaces the lines of an unpaid invoice). Returns <c>false</c> when there is nothing to bill or it is already paid.
    /// </summary>
    Task<bool> RefreshInvoiceAsync(LabRequisition requisition, CancellationToken ct);
}
