namespace ClinicEz.PhilHealthProxy.Application.Common;

/// <summary>
/// Unified response for all PhilHealth Konsulta SOAP operations.
/// The <see cref="RawReturn"/> field contains the raw <c>return</c> string
/// from the SOAP response — callers parse it according to the operation's spec.
/// </summary>
public sealed record KonsultaOperationResponse(
    bool IsSuccess,
    string? RawReturn,
    string? ErrorCode,
    string? ErrorMessage);
