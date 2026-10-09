using ClinicEz.Pharmacy.Application.Common;
using ClinicEz.Pharmacy.Domain.Entities;

namespace ClinicEz.Pharmacy.Application.Features.Prescriptions.DTOs;

public static class PrescriptionDtoExtensions
{
    /// <summary>Fills the review / payment-gate fields of a DTO from the order it was built from.</summary>
    public static PrescriptionOrderDto WithWorkflow(this PrescriptionOrderDto dto, PrescriptionOrder order) => dto with
    {
        PaymentPolicy = order.PaymentPolicy.ToString(),
        PaymentStatus = order.PaymentStatus.ToString(),
        QuotedAmount = order.QuotedAmount,
        PaidAt = order.PaidAt,
        StatusReason = order.StatusReason,
        PharmacyName = order.PharmacyName,
        DispenseBlockedReason = PrescriptionDispenseGate.BlockedReason(order),
        PatientLinked = order.PatientId != Guid.Empty
    };
}
