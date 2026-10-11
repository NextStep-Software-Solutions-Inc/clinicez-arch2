using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;

namespace ClinicEz.Pharmacy.Application.Common;

/// <summary>
/// The review + payment gate in front of every dispense. Orders received before the gate existed carry
/// <see cref="PharmacyPaymentPolicy.None"/> and are never blocked; otherwise the order must be accepted first, and under a
/// Prepaid policy billing must also have confirmed payment.
/// </summary>
public static class PrescriptionDispenseGate
{
    public static string? BlockedReason(PrescriptionOrder order)
    {
        if (order.PaymentPolicy == PharmacyPaymentPolicy.None
            || order.Status is PrescriptionStatus.Dispensed or PrescriptionStatus.Cancelled or PrescriptionStatus.Rejected)
        {
            return null;
        }

        if (order.Status == PrescriptionStatus.Pending)
        {
            return PharmacyErrorCodes.AcceptanceRequired;
        }

        return order.PaymentPolicy == PharmacyPaymentPolicy.Prepaid && order.PaymentStatus != PrescriptionPaymentStatus.Paid
            ? PharmacyErrorCodes.PaymentRequired
            : null;
    }

    public static void EnsureCanDispense(PrescriptionOrder order)
    {
        switch (BlockedReason(order))
        {
            case PharmacyErrorCodes.AcceptanceRequired:
                throw new PharmacyConflictException(
                    PharmacyErrorCodes.AcceptanceRequired,
                    $"Prescription '{order.PrescriptionNumber}' must be accepted before it can be dispensed.");
            case PharmacyErrorCodes.PaymentRequired:
                throw new PharmacyConflictException(
                    PharmacyErrorCodes.PaymentRequired,
                    $"Payment for prescription '{order.PrescriptionNumber}' has not been confirmed. Collect payment at the cashier before dispensing.");
        }
    }
}
