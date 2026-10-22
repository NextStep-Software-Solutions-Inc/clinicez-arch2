using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Persistence;

public static class ClinicRoleSeeder
{
    public const string SystemAdminRoleName = "Clinic Administrator";
    public const string DpoRoleName = "Data Protection Officer / Compliance Officer";
    public const string DoctorRoleName = "Attending Physician / Doctor";
    public const string NurseRoleName = "Triage Nurse";
    public const string ReceptionistRoleName = "Front Desk Receptionist";
    public const string CashierRoleName = "Clinic Cashier / Billing Officer";

    public static IReadOnlyList<ClinicRoleTemplate> GetCanonicalSystemRoleTemplates() => new List<ClinicRoleTemplate>
    {
        new(
            SystemAdminRoleName,
            "Full operational administration, billing oversight, and custom role management",
            new List<string>(ClinicPermissions.All)
        ),
        new(
            DpoRoleName,
            "Patient privacy protection, audit log forensics, compliance reporting, and regulatory inspection review",
            new List<string>
            {
                ClinicPermissions.AuditRead,
                ClinicPermissions.AuditExport,
                ClinicPermissions.ReportsRead,
                ClinicPermissions.SettingsRead,
                ClinicPermissions.PatientsRead
            }
        ),
        new(
            DoctorRoleName,
            "Consultation documentation, vitals recording & review, prescription issuing, lab/procedure ordering, and encounter signing",
            new List<string>
            {
                ClinicPermissions.AppointmentsRead,
                ClinicPermissions.QueueRead,
                ClinicPermissions.QueueCall,
                ClinicPermissions.QueueComplete,
                ClinicPermissions.TriageRead,
                ClinicPermissions.TriageWrite,
                ClinicPermissions.ConsultationsRead,
                ClinicPermissions.ConsultationsWrite,
                ClinicPermissions.ConsultationsSign,
                ClinicPermissions.PatientsRead,
                ClinicPermissions.DocumentsRead,
                ClinicPermissions.DocumentsIssue,
                ClinicPermissions.RecordsRead,
                ClinicPermissions.RecordsUpload,
                ClinicPermissions.ProceduresRead,
                ClinicPermissions.ProceduresWrite,
                ClinicPermissions.LabOrdersRead,
                ClinicPermissions.LabOrdersWrite,
                ClinicPermissions.LabResultsReview,
                ClinicPermissions.ServicesRead
            }
        ),
        new(
            NurseRoleName,
            "Patient vitals capture, queue flow monitoring, procedure administration (nebulization/vaccination), and doctor assistance",
            new List<string>
            {
                ClinicPermissions.AppointmentsRead,
                ClinicPermissions.QueueRead,
                ClinicPermissions.QueueCall,
                ClinicPermissions.TriageRead,
                ClinicPermissions.TriageWrite,
                ClinicPermissions.PatientsRead,
                ClinicPermissions.RecordsRead,
                ClinicPermissions.RecordsUpload,
                ClinicPermissions.ConsultationsRead,
                ClinicPermissions.ProceduresRead,
                ClinicPermissions.ProceduresWrite,
                ClinicPermissions.ServicesRead
            }
        ),
        new(
            ReceptionistRoleName,
            "Patient check-in, walk-in ticket issuing, cashier billing, queue coordination, and appointments management",
            new List<string>
            {
                ClinicPermissions.AppointmentsRead,
                ClinicPermissions.AppointmentsManage,
                ClinicPermissions.QueueRead,
                ClinicPermissions.QueueCheckIn,
                ClinicPermissions.QueueCall,
                ClinicPermissions.PatientsRead,
                ClinicPermissions.PatientsWrite,
                ClinicPermissions.DocumentsRead,
                ClinicPermissions.RecordsRead,
                ClinicPermissions.StaffRead,
                ClinicPermissions.BillingRead,
                ClinicPermissions.BillingWrite,
                ClinicPermissions.ServicesRead,
                ClinicPermissions.ReportsRead
            }
        ),
        new(
            CashierRoleName,
            "Patient billing settlement, official receipts, Senior/PWD discounts, and daily cashier remittance reconciliation",
            new List<string>
            {
                ClinicPermissions.QueueRead,
                ClinicPermissions.BillingRead,
                ClinicPermissions.BillingWrite,
                ClinicPermissions.BillingVoid,
                ClinicPermissions.ServicesRead,
                ClinicPermissions.ReportsRead
            }
        )
    };

    /// <summary>
    /// Seeds or synchronizes system roles for a single clinic during onboarding/bootstrapping.
    /// Strictly updates only built-in system roles (IsSystem == true); custom roles remain untouched.
    /// </summary>
    public static async Task SeedDefaultRolesForClinicAsync(
        ApplicationDbContext dbContext,
        string tenantId,
        Guid clinicId,
        CancellationToken ct = default)
    {
        await SyncClinicSystemRolesInternalAsync(dbContext, tenantId, clinicId, ct);
    }

    /// <summary>
    /// Multi-clinic startup hosted synchronization: iterates all clinics and ensures every clinic has all
    /// canonical system roles and up-to-date system permissions (such as AuditRead and AuditExport).
    /// Strictly updates only built-in system roles (IsSystem == true); custom roles remain untouched.
    /// </summary>
    public static async Task<int> SeedOrUpdateAllClinicsAsync(
        ApplicationDbContext dbContext,
        ILogger? logger = null,
        CancellationToken ct = default)
    {
        var clinicIdentities = await dbContext.ClinicRoles
            .IgnoreQueryFilters()
            .Select(r => new { r.ClinicId, r.TenantId })
            .Distinct()
            .ToListAsync(ct);

        if (clinicIdentities.Count == 0)
        {
            clinicIdentities = await dbContext.ClinicSettings
                .IgnoreQueryFilters()
                .Select(s => new { s.ClinicId, s.TenantId })
                .Distinct()
                .ToListAsync(ct);
        }

        int updatedCount = 0;
        foreach (var clinic in clinicIdentities)
        {
            var modified = await SyncClinicSystemRolesInternalAsync(dbContext, clinic.TenantId, clinic.ClinicId, ct);
            if (modified)
            {
                updatedCount++;
            }
        }

        logger?.LogInformation("ClinicRoleSeeder: Processed {Total} clinic(s), updated system roles for {Updated} clinic(s).",
            clinicIdentities.Count, updatedCount);

        return updatedCount;
    }

    private static async Task<bool> SyncClinicSystemRolesInternalAsync(
        ApplicationDbContext dbContext,
        string tenantId,
        Guid clinicId,
        CancellationToken ct)
    {
        var templates = GetCanonicalSystemRoleTemplates();
        var existingSystemRoles = await dbContext.ClinicRoles
            .IgnoreQueryFilters()
            .Where(r => r.ClinicId == clinicId && r.IsSystem)
            .ToListAsync(ct);

        var existingMap = existingSystemRoles.ToDictionary(r => r.Name, StringComparer.OrdinalIgnoreCase);
        bool hasChanges = false;

        foreach (var template in templates)
        {
            if (!existingMap.TryGetValue(template.Name, out var existingRole))
            {
                // Create missing system role
                var newRole = new ClinicRole
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ClinicId = clinicId,
                    Name = template.Name,
                    Description = template.Description,
                    IsSystem = true,
                    Permissions = new List<string>(template.Permissions),
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = "System:Seeder"
                };

                await dbContext.ClinicRoles.AddAsync(newRole, ct);
                hasChanges = true;
            }
            else
            {
                // Synchronize canonical system permissions across all built-in system roles
                var targetPermissions = template.Name.Equals(SystemAdminRoleName, StringComparison.OrdinalIgnoreCase)
                    ? ClinicPermissions.All
                    : template.Permissions;

                var missingPerms = targetPermissions
                    .Where(p => !existingRole.Permissions.Contains(p, StringComparer.OrdinalIgnoreCase))
                    .ToList();

                if (missingPerms.Count > 0)
                {
                    existingRole.Permissions.AddRange(missingPerms);
                    hasChanges = true;
                }
            }
        }

        if (hasChanges)
        {
            await dbContext.SaveChangesAsync(ct);
        }

        return hasChanges;
    }
}

public sealed record ClinicRoleTemplate(string Name, string Description, IReadOnlyList<string> Permissions);
