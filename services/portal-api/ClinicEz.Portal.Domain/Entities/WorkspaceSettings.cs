using ClinicEz.Portal.Domain.Common;
using System;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>
/// Workspace-scoped (tenant-wide) settings, 1:1 with <see cref="Tenant"/>.
/// Rows are created lazily with defaults the first time a workspace's settings are read or written.
/// Facility-specific configuration (letterhead, paper size, stamps) lives in each facility's own service.
/// </summary>
public class WorkspaceSettings : BaseEntity
{
    public static readonly string[] SupportedDateFormats =
    [
        "MMM d, yyyy",
        "d MMM yyyy",
        "dd/MM/yyyy",
        "MM/dd/yyyy",
        "yyyy-MM-dd"
    ];

    public const string DefaultTimeZoneId = "Asia/Manila";
    public const string DefaultLocale = "en-PH";
    public const string DefaultDateFormat = "MMM d, yyyy";
    public const string DefaultCurrencyCode = "PHP";

    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;

    // Locale defaults inherited by every facility of the workspace.
    public string TimeZoneId { get; set; } = DefaultTimeZoneId; // IANA id
    public string Locale { get; set; } = DefaultLocale;
    public string DateFormat { get; set; } = DefaultDateFormat;
    public string CurrencyCode { get; set; } = DefaultCurrencyCode;

    // Brand identity: the workspace default that facilities inherit. Null = not customised
    // (display name falls back to Tenant.Name, logo to none, accent to the product theme).
    public string? BrandName { get; set; }
    public string? LogoUrl { get; set; } // https only
    public string? AccentColorHex { get; set; } // #RRGGBB

    /// <summary>Monotonic version of everything exposed by the workspace profile; drives ETag/cache invalidation.</summary>
    public long ProfileVersion { get; set; } = 1;
}
