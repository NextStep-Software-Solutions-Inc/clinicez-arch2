namespace ClinicEz.PhilHealthProxy.Domain.Models;

/// <summary>Generic wrapper for a SOAP operation result.</summary>
public sealed record SoapResult(
    bool IsSuccess,
    string? ResponseXml,
    string? ErrorCode,
    string? ErrorMessage);
