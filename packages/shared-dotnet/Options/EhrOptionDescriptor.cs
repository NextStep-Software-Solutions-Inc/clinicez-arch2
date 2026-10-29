using System.Collections.Generic;

namespace ClinicEz.Shared.Options;

/// <summary>
/// Uniform descriptor for a selectable EHR clinical option across backend and frontend.
/// Used for Tier A static option registries and Tier B dynamic catalog projections.
/// Located in ClinicEz.Shared.Options so clinic-api, patient-api, and portal-api share one single source of truth.
/// </summary>
public sealed class EhrOptionDescriptor
{
    /// <summary>
    /// Canonical, human-readable, payer-agnostic ClinicEZ EHR option code
    /// (e.g. "MALE", "FEMALE", "INTERSEX", "ROMAN_CATHOLIC", "MOTHER", "ORAL", "BID").
    /// </summary>
    public required string Code { get; init; }

    /// <summary>Display label for UI pickers and clinical reports.</summary>
    public required string Label { get; init; }

    /// <summary>
    /// Statutory PhilHealth code equivalent (e.g. "M", "W", "69", "PO", "BID").
    /// Null when the option is an EHR-only choice without a direct PhilHealth statutory equivalent.
    /// </summary>
    public string? PhilHealthCode { get; init; }

    /// <summary>
    /// Target PhilHealth statutory library name (e.g. "lib_sex", "lib_religion", "lib_medicine_route").
    /// </summary>
    public string? PhilHealthLibrary { get; init; }

    /// <summary>
    /// Indicates whether selecting this option requires free-text specification (e.g. "OTHERS").
    /// </summary>
    public bool RequiresSpecifyText { get; init; } = false;

    /// <summary>
    /// Whether this option is active for new records. Inactive statutory codes (LIBRARY STATUS = 0) are false.
    /// </summary>
    public bool IsActive { get; init; } = true;

    /// <summary>Optional arbitrary metadata key-values (e.g. category, dose form, ICD-10 grouping).</summary>
    public IReadOnlyDictionary<string, string>? Metadata { get; init; }
}
