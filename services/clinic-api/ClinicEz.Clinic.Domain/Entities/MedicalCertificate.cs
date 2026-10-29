using System;
using System.Collections.Frozen;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed partial class MedicalCertificate : ClinicScopedEntity
{
    private static readonly FrozenDictionary<string, string> KnownCanonicalStatuses =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["FitToWork"] = "FIT TO WORK",
            ["UnfitToWork"] = "UNFIT TO WORK",
            ["FitToSchool"] = "FIT TO SCHOOL",
            ["LightDuty"] = "LIGHT DUTY",
            ["FitWithRestrictions"] = "FIT WITH RESTRICTIONS",
            ["FitForWork"] = "FIT FOR WORK",
            ["UnfitForWork"] = "UNFIT FOR WORK"
        }.ToFrozenDictionary(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Sequential Certificate Number, e.g. MC-20260929-0001
    /// </summary>
    public required string CertificateNumber { get; set; }

    public Guid PatientId { get; set; }
    public Patient? Patient { get; set; }
    public required string PatientName { get; set; }
    public Guid? ConsultationId { get; set; }

    public Guid DoctorId { get; set; }
    public required string DoctorName { get; set; }
    public required string PrcLicenseNumber { get; set; }
    public string? PtrNumber { get; set; }

    public DateOnly IssueDate { get; set; }

    public required string Diagnosis { get; set; }
    public string? ClinicalFindings { get; set; }

    /// <summary>
    /// Fitness status: FitToWork, UnfitToWork, FitToSchool, FitWithRestrictions, LightDuty
    /// </summary>
    public string FitnessStatus { get; set; } = "FitToWork";

    public int? RecommendedRestDays { get; set; }
    public DateOnly? RestStartDate { get; set; }
    public DateOnly? RestEndDate { get; set; }

    /// <summary>
    /// Purpose: Employment, School, Travel, Legal, General
    /// </summary>
    public string Purpose { get; set; } = "Employment";

    public string? Remarks { get; set; }

    public bool IsSigned { get; set; }
    public DateTime? SignedAt { get; set; }
    public string? SecurityDigest { get; set; }

    /// <summary>
    /// Formats the raw stored FitnessStatus string into a canonical human-readable, space-separated uppercase string
    /// (e.g. "FitToWork" -> "FIT TO WORK", "UnfitToWork" -> "UNFIT TO WORK", "LightDuty" -> "LIGHT DUTY").
    /// Handles unspaced uppercase codes ("FITTOWORK"), delimited strings ("fit_to_work", "light-duty"),
    /// arbitrary PascalCase/acronyms ("FitForTravel", "TemporaryUnfit"), and safely returns string.Empty for null/whitespace.
    /// </summary>
    public static string FormatFitnessStatus(string? fitnessStatus)
    {
        if (string.IsNullOrWhiteSpace(fitnessStatus))
        {
            return string.Empty;
        }

        var trimmed = fitnessStatus.Trim();

        // 1. Check known canonical statuses by stripping non-alphanumeric characters.
        // Handles "FitToWork", "fit to work", "FIT TO WORK", "FITTOWORK", "fit_to_work", "fit-to-work", etc.
        var stripped = AlphanumericStripRegex().Replace(trimmed, "");
        if (KnownCanonicalStatuses.TryGetValue(stripped, out var canonicalFormatted))
        {
            return canonicalFormatted;
        }

        // 2. For arbitrary strings, replace delimiter characters (underscores, hyphens) with spaces.
        var delimited = DelimitersRegex().Replace(trimmed, " ");

        // 3. Separate PascalCase boundaries and acronym transitions.
        var spaced = PascalCaseRegex().Replace(delimited, " ");

        // 4. Collapse multiple spaces and return invariant uppercase.
        var normalized = WhitespaceRegex().Replace(spaced, " ").Trim();

        return normalized.ToUpperInvariant();
    }

    [GeneratedRegex(@"[^a-zA-Z0-9]", RegexOptions.None, matchTimeoutMilliseconds: 1000)]
    private static partial Regex AlphanumericStripRegex();

    [GeneratedRegex(@"[_\-]+", RegexOptions.None, matchTimeoutMilliseconds: 1000)]
    private static partial Regex DelimitersRegex();

    [GeneratedRegex(@"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", RegexOptions.None, matchTimeoutMilliseconds: 1000)]
    private static partial Regex PascalCaseRegex();

    [GeneratedRegex(@"\s+", RegexOptions.None, matchTimeoutMilliseconds: 1000)]
    private static partial Regex WhitespaceRegex();
}
