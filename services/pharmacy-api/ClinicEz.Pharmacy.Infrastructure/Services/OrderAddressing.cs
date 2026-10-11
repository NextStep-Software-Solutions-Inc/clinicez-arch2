using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;

namespace ClinicEz.Pharmacy.Infrastructure.Services;

/// <summary>Who an outgoing message about a prescription order is from and to. One definition so every message agrees.</summary>
internal static class OrderAddressing
{
    public static Party Pharmacy(PrescriptionOrder order) =>
        Party.ForFacility(order.TenantId, order.PharmacyId, FacilityType.Pharmacy);

    public static Party PharmacyBilling(PrescriptionOrder order) =>
        Party.ForFacility(order.TenantId, order.PharmacyId, FacilityType.Pharmacy, InteropServices.Billing);

    /// <summary>The clinic that sent (or whose patient claimed) the prescription. Throws if the order was never addressed to one.</summary>
    public static Party OrderingClinic(PrescriptionOrder order)
    {
        if (string.IsNullOrWhiteSpace(order.OrderingTenantId) || string.IsNullOrWhiteSpace(order.OrderingFacilityId))
        {
            throw new InvalidOperationException(
                $"Prescription '{order.PrescriptionNumber}' has no ordering clinic recorded, so its updates cannot be addressed.");
        }

        return Party.ForFacility(order.OrderingTenantId, order.OrderingFacilityId, FacilityType.Clinic);
    }

    /// <summary>The patient-api patient, or null when the patient is not a ClinicEZ patient (no id is ever fabricated).</summary>
    public static Party? Patient(PrescriptionOrder order) =>
        order.PatientId == Guid.Empty ? null : Party.ForPatient(order.PatientId.ToString());

    public static Guid? PatientId(PrescriptionOrder order) =>
        order.PatientId == Guid.Empty ? null : order.PatientId;

    public static Guid Correlation(PrescriptionOrder order) =>
        order.CorrelationId != Guid.Empty ? order.CorrelationId : order.ExternalPrescriptionId;
}
