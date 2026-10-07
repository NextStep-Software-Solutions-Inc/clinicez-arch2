using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

/// <summary>
/// One row of an official PhilHealth Konsulta / YAKAP library (<c>lib_*</c>) in the PhilHealth Catalog.
/// The catalog is shared by every clinic on the server (reference data, not tenant data).
/// </summary>
public sealed class PhilHealthCatalogItem : BaseEntity
{
    /// <summary>Library name exactly as published by PhilHealth, e.g. <c>lib_icd</c>, <c>lib_mdiseases</c>.</summary>
    public required string Library { get; set; }

    /// <summary>
    /// Natural identity within a library. Equals <see cref="Code"/> except for libraries that legitimately list several
    /// terms per code (<c>lib_icd</c>), where a short fingerprint of the normalised description is appended.
    /// </summary>
    public required string ItemKey { get; set; }

    public required string Code { get; set; }
    public string Description { get; set; } = string.Empty;

    /// <summary>PhilHealth "LIBRARY STATUS": only active entries may be used in new records. Items are deactivated, never deleted.</summary>
    public bool IsActive { get; set; } = true;

    /// <summary>Library specific columns (e.g. medicine form/strength codes, z-score thresholds) as a JSON object.</summary>
    public string? AttributesJson { get; set; }

    /// <summary>Kit version the row last came from, e.g. <c>1.1</c>.</summary>
    public string KitVersion { get; set; } = string.Empty;
}

public enum PhilHealthCatalogImportSource
{
    Seed = 0,
    Upload = 1,
}

public enum PhilHealthCatalogImportStatus
{
    Applied = 0,
    Unchanged = 1,
    Skipped = 2,
    Rejected = 3,
    DryRun = 4,
}

/// <summary>Audit trail of every catalog import (boot seeding and administrator uploads).</summary>
public sealed class PhilHealthCatalogImportLog : BaseEntity
{
    public required string Library { get; set; }
    public string KitVersion { get; set; } = string.Empty;
    public PhilHealthCatalogImportSource Source { get; set; }
    public PhilHealthCatalogImportStatus Status { get; set; }

    /// <summary>SHA-256 of the canonical content. Identical content is never re-applied.</summary>
    public string ContentHash { get; set; } = string.Empty;

    public int Added { get; set; }
    public int Updated { get; set; }
    public int Unchanged { get; set; }
    public int Deactivated { get; set; }
    public int DuplicatesIgnored { get; set; }

    public string? Message { get; set; }
}
