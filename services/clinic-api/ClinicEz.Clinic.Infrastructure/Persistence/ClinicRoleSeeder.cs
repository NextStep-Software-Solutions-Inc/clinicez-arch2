using System;
using System.Collections.Generic;
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

        if (existing) return;

        var roles = new List<ClinicRole>
        {
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Name = "Clinic Administrator",
                Description = "Full operational administration and custom role management",
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
                Description = "Consultation documentation, vitals review, prescription issuing, and encounter signing",
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
                    ClinicPermissions.ConsultationsSign
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
                Description = "Patient vitals capture, queue flow monitoring, and doctor assistance",
                IsSystem = true,
                Permissions = new List<string>
                {
                    ClinicPermissions.AppointmentsRead,
                    ClinicPermissions.QueueRead,
                    ClinicPermissions.QueueCall,
                    ClinicPermissions.TriageRead,
                    ClinicPermissions.TriageWrite,
                    ClinicPermissions.ConsultationsRead
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
                Description = "Patient check-in, walk-in ticket issuing, queue coordination, and appointments management",
                IsSystem = true,
                Permissions = new List<string>
                {
                    ClinicPermissions.AppointmentsRead,
                    ClinicPermissions.AppointmentsManage,
                    ClinicPermissions.QueueRead,
                    ClinicPermissions.QueueCheckIn,
                    ClinicPermissions.QueueCall,
                    ClinicPermissions.StaffRead
                },
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "System:Seeder"
            }
        };

        await dbContext.ClinicRoles.AddRangeAsync(roles, ct);
        await dbContext.SaveChangesAsync(ct);
    }
}
