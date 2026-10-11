using System.Collections.Generic;

namespace ClinicEz.Portal.Domain.Constants;

public static class Permissions
{
    public const string ViewAnalytics = "view:analytics";
    public const string ViewTenants = "view:tenants";
    public const string ManageTenants = "manage:tenants";
    public const string ToggleSubscription = "toggle:subscription";
    public const string ManageBlogs = "manage:blogs";
    public const string ManageRoles = "manage:roles";
    public const string ManageAdmins = "manage:admins";
    public const string ManageSettings = "manage:settings";

    public static readonly IReadOnlyList<string> All = new List<string>
    {
        ViewAnalytics,
        ViewTenants,
        ManageTenants,
        ToggleSubscription,
        ManageBlogs,
        ManageRoles,
        ManageAdmins,
        ManageSettings
    }.AsReadOnly();
}
