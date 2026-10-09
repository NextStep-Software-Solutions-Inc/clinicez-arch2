using ClinicEz.Laboratory.Application.Common.Exceptions;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Shared.Exceptions;

namespace ClinicEz.Laboratory.Application.Common;

/// <summary>
/// Guards the work on an order: nothing happens on a rejected or cancelled order, and the payment gate owned by the
/// laboratory keeps a prepaid order untouched until it is paid.
/// </summary>
public static class OrderWorkGate
{
    /// <summary>
    /// Throws <see cref="PaymentRequiredException"/> while a prepaid order is unpaid (postpaid and unbilled orders always
    /// pass) and <see cref="ConflictException"/> for an order that was rejected or cancelled.
    /// </summary>
    public static void EnsureCanWork(LabRequisition requisition)
    {
        if (requisition.Stage is RequisitionStage.Rejected or RequisitionStage.Cancelled)
        {
            throw new ConflictException($"Requisition {requisition.Id} was {requisition.Stage.ToString().ToLowerInvariant()}; no further work is possible.");
        }

        if (requisition.IsPaymentBlocking)
        {
            throw new PaymentRequiredException(requisition.Id);
        }
    }
}
