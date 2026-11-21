using System;

namespace ClinicEz.Clinic.Application.Common.Exceptions;

/// <summary>
/// Thrown when clinician attempts to admit an unpaid patient to a prepaid teleconsultation session.
/// Mapped to HTTP 409 Conflict with machine-readable error code "payment_required".
/// </summary>
public sealed class TeleconsultPaymentRequiredException : Exception
{
    public const string ErrorCode = "payment_required";

    public Guid AppointmentId { get; }
    public decimal AmountDue { get; }

    public TeleconsultPaymentRequiredException(Guid appointmentId, decimal amountDue)
        : base($"Appointment {appointmentId} is a prepaid teleconsultation and has not been settled yet. Admission is blocked until payment is confirmed by the cashier or an emergency clinical override is authorized.")
    {
        AppointmentId = appointmentId;
        AmountDue = amountDue;
    }
}
