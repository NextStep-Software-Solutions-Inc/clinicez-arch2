namespace ClinicEz.Portal.Application.Features.Notifications;

/// <summary>
/// Where the portal and administration websites live, for links placed in emails and DTOs.
/// </summary>
public interface IFrontendUrlProvider
{
    /// <summary>Absolute base URL for the multi-tenant portal without a trailing slash, or null when it cannot be determined.</summary>
    string? GetBaseUrl();

    /// <summary>Absolute base URL for the standalone platform administration portal without a trailing slash, or null when it cannot be determined.</summary>
    string? GetAdminBaseUrl();
}
