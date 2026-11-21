using System;

namespace ClinicEz.PhilHealthProxy.Domain.Exceptions;

/// <summary>
/// Structured upstream/configuration error from the PhilHealth PCAPI v2.0 gateway
/// carrying the HTTP status and machine error code for clear clinic diagnostics.
/// </summary>
public sealed class PhilHealthGatewayException : Exception
{
    public int StatusCode { get; }
    public string ErrorCode { get; }

    public PhilHealthGatewayException(
        int statusCode,
        string errorCode,
        string message,
        Exception? innerException = null)
        : base(message, innerException)
    {
        StatusCode = statusCode;
        ErrorCode = errorCode;
    }
}
