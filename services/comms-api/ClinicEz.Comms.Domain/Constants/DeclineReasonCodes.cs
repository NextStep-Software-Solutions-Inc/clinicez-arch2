using System;
using System.Collections.Generic;

namespace ClinicEz.Comms.Domain.Constants;

/// <summary>
/// Mandatory reason codes required when declining a patient-to-facility inquiry.
/// </summary>
public static class DeclineReasonCodes
{
    public const string OutOfScope = "OUT_OF_SCOPE";
    public const string InsufficientInformation = "INSUFFICIENT_INFORMATION";
    public const string Ineligible = "INELIGIBLE";
    public const string EmergencyReferred = "EMERGENCY_REFERRED";
    public const string Spam = "SPAM";

    public static readonly HashSet<string> All = new(StringComparer.OrdinalIgnoreCase)
    {
        OutOfScope,
        InsufficientInformation,
        Ineligible,
        EmergencyReferred,
        Spam
    };

    public static bool IsValid(string? code) =>
        !string.IsNullOrWhiteSpace(code) && All.Contains(code.Trim());
}
