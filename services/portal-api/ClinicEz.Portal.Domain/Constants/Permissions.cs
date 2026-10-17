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
    public const string ManagePlans = "manage:plans";

    public static readonly IReadOnlyList<string> All = new List<string>
    {
        ViewAnalytics,
        ViewTenants,
        ManageTenants,
        ToggleSubscription,
        ManageBlogs,
        ManageRoles,
        ManageAdmins,
        ManageSettings,
        ManagePlans
    }.AsReadOnly();

    public static readonly IReadOnlyList<PermissionDefinition> Definitions = new List<PermissionDefinition>
    {
        new(ViewAnalytics, "View Analytics", "Allows viewing high-level dashboard charts, stats, and estimated MRR.", "Analytics"),
        new(ViewTenants, "View Tenants & Leads", "Allows viewing lists of registered tenants and conversion leads.", "Tenants"),
        new(ManageTenants, "Manage Tenant Details", "Allows modifying organization files and onboarding status.", "Tenants"),
        new(ToggleSubscription, "Adjust Subscription Plan", "Allows manually upgrading/downgrading tenant billing active states and recording offline payments.", "Billing"),
        new(ManageBlogs, "Manage Blogs (CRM)", "Allows creating, updating, and deleting marketing blog posts.", "Content"),
        new(ManageRoles, "Manage Roles & Access", "Allows viewing, creating, and editing roles and permissions configurations.", "Administration"),
        new(ManageAdmins, "Manage Admin Users", "Allows full control to invite, edit, or delete other administrative profiles.", "Administration"),
        new(ManageSettings, "Manage Platform Settings", "Allows configuring platform-wide system settings and environment parameters.", "System"),
        new(ManagePlans, "Manage Commercial Plans", "Allows creating, updating, and managing commercial subscription tiers, limits, and feature entitlements.", "Billing")
    }.AsReadOnly();
}

public record PermissionDefinition(string Token, string Label, string Description, string Category);

