using System;

namespace ClinicEz.Laboratory.Application.Common.Exceptions;

/// <summary>
/// A prepaid order has not been paid yet, so specimen collection and processing are blocked. Surfaces as
/// HTTP 409 with the machine-readable error code <see cref="ErrorCode"/>.
/// </summary>
public sealed class PaymentRequiredException : Exception
{
    public const string ErrorCode = "payment_required";

    public Guid RequisitionId { get; }

    public PaymentRequiredException(Guid requisitionId)
        : base($"Requisition {requisitionId} is prepaid and has not been paid yet; specimen collection and processing are blocked until the cashier confirms payment.")
    {
        RequisitionId = requisitionId;
    }
}
