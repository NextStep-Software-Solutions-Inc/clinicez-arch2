using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Infrastructure.Persistence;

public static class ClinicRoleSeeder
{
    public static async Task SeedDefaultRolesForClinicAsync(
        ApplicationDbContext dbContext,
        string tenantId,
        Guid clinicId,
        CancellationToken ct = default)
    {
        var existing = await dbContext.ClinicRoles
            .IgnoreQueryFilters()
            .AnyAsync(r => r.ClinicId == clinicId, ct);

        if (existing)
        {
            // Idempotently ensure the system "Clinic Administrator" role receives newly added permissions (AuditRead, AuditExport)
            var adminRole = await dbContext.ClinicRoles
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(r => r.ClinicId == clinicId && r.IsSystem && r.Name == "Clinic Administrator", ct);

            if (adminRole != null)
            {
                var missingPermissions = ClinicPermissions.All
                    .Where(p => !adminRole.Permissions.Contains(p))
                    .ToList();

                if (missingPermissions.Count > 0)
                {
                    adminRole.Permissions.AddRange(missingPermissions);
                    await dbContext.SaveChangesAsync(ct);
                }
            }
            return;
        }

        var roles = new List<ClinicRole>
        {
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Name = "Clinic Administrator",
                Description = "Full operational administration, billing oversight, and custom role management",
                IsSystem = true,
                Permissions = new List<string>(ClinicPermissions.All),
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "System:Seeder"
            },
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Name = "Attending Physician / Doctor",
                Description = "Consultation documentation, vitals review, prescription issuing, lab/procedure ordering, and encounter signing",
                IsSystem = true,
                Permissions = new List<string>
                {
                    ClinicPermissions.AppointmentsRead,
                    ClinicPermissions.QueueRead,
                    ClinicPermissions.QueueCall,
                    ClinicPermissions.QueueComplete,
                    ClinicPermissions.TriageRead,
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
                },
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "System:Seeder"
            },
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Name = "Triage Nurse",
                Description = "Patient vitals capture, queue flow monitoring, procedure administration (nebulization/vaccination), and doctor assistance",
                IsSystem = true,
                Permissions = new List<string>
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
                },
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "System:Seeder"
            },
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Name = "Front Desk Receptionist",
                Description = "Patient check-in, walk-in ticket issuing, cashier billing, queue coordination, and appointments management",
                IsSystem = true,
                Permissions = new List<string>
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
                },
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "System:Seeder"
            },
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Name = "Clinic Cashier / Billing Officer",
                Description = "Patient billing settlement, official receipts, Senior/PWD discounts, and daily cashier remittance reconciliation",
                IsSystem = true,
                Permissions = new List<string>
                {
                    ClinicPermissions.QueueRead,
                    ClinicPermissions.BillingRead,
                    ClinicPermissions.BillingWrite,
                    ClinicPermissions.BillingVoid,
                    ClinicPermissions.ServicesRead,
                    ClinicPermissions.ReportsRead
                },
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "System:Seeder"
            }
        };

        await dbContext.ClinicRoles.AddRangeAsync(roles, ct);
        await dbContext.SaveChangesAsync(ct);
    }
}
