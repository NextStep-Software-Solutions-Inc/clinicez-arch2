using System;

namespace ClinicEz.Clinic.Application.Common.Exceptions;

/// <summary>
/// A local cashier payment was attempted on an invoice that was requested to the shared billing counter. The counter owns
/// that collection (a local payment would charge the patient twice), so the clinic answers HTTP 409 with the
/// machine-readable error code <see cref="ErrorCode"/>.
/// </summary>
public sealed class PaidAtBillingCounterException : Exception
{
    public const string ErrorCode = "paid_at_billing_counter";

    public PaidAtBillingCounterException(string invoiceNumber)
        : base($"Invoice {invoiceNumber} is collected at the billing counter. Take the payment there; it will appear on this invoice automatically.")
    {
    }
}
