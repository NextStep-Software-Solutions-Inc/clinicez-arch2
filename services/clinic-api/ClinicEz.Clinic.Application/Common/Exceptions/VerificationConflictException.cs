using System;
using ClinicEz.Shared.Exceptions;

namespace ClinicEz.Clinic.Application.Common.Exceptions;

/// <summary>
/// Thrown when an in-place directory verification update or submission conflicts with a non-pending request status.
/// </summary>
public sealed class VerificationConflictException : ConflictException
{
    public const string ErrorCode = "verification_request_not_pending";

    public string? CurrentStatus { get; }
    public Guid? RequestId { get; }

    public VerificationConflictException(string message, string? currentStatus = null, Guid? requestId = null)
        : base(message)
    {
        CurrentStatus = currentStatus;
        RequestId = requestId;
    }

    public VerificationConflictException(string message, Exception innerException, string? currentStatus = null, Guid? requestId = null)
        : base(message, innerException)
    {
        CurrentStatus = currentStatus;
        RequestId = requestId;
    }
}

public sealed record VerificationConflictData(
    string? CurrentStatus,
    Guid? RequestId);
