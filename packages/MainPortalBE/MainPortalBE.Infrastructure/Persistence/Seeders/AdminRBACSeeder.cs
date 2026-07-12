using System;
using System.Collections.Generic;
using MainPortalBE.Domain.Constants;
using MainPortalBE.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace MainPortalBE.Infrastructure.Persistence.Seeders;

public static class AdminRBACSeeder
{
    public static void Seed(ModelBuilder modelBuilder)
    {
        var seedDate = new DateTime(2026, 7, 12, 0, 0, 0, DateTimeKind.Utc);
        
        var superAdminRoleId = Guid.Parse("44444444-4444-4444-4444-444444444444");
        var supportStaffRoleId = Guid.Parse("55555555-5555-5555-5555-555555555555");
        var contentWriterRoleId = Guid.Parse("66666666-6666-6666-6666-666666666666");

        // 1. Seed Roles
        modelBuilder.Entity<AdminRole>().HasData(
            new AdminRole
            {
                Id = superAdminRoleId,
                Name = "Super Admin",
                Description = "Full platform administrative control, including tenant and permissions management.",
                Permissions = new List<string>(Permissions.All),
                CreatedAt = seedDate,
                CreatedBy = "System"
            },
            new AdminRole
            {
                Id = supportStaffRoleId,
                Name = "Support Staff",
                Description = "Provides support, views tenants and leads, writes blogs.",
                Permissions = new List<string> { Permissions.ViewAnalytics, Permissions.ViewTenants, Permissions.ManageBlogs },
                CreatedAt = seedDate,
                CreatedBy = "System"
            },
            new AdminRole
            {
                Id = contentWriterRoleId,
                Name = "Content Writer",
                Description = "Maintains marketing resources, writes blog articles.",
                Permissions = new List<string> { Permissions.ManageBlogs },
                CreatedAt = seedDate,
                CreatedBy = "System"
            }
        );

        // 2. Seed Default Admin Users
        modelBuilder.Entity<AdminUser>().HasData(
            new AdminUser
            {
                Id = Guid.Parse("77777777-7777-7777-7777-777777777777"),
                ClerkUserId = "", // Link dynamically on first login
                Email = "admin@clinicez.net",
                FullName = "System Super Admin",
                RoleId = superAdminRoleId,
                IsActive = true,
                CreatedAt = seedDate,
                CreatedBy = "System"
            },
            new AdminUser
            {
                Id = Guid.Parse("88888888-8888-8888-8888-888888888888"),
                ClerkUserId = "", // Link dynamically on first login
                Email = "staff@clinicez.net",
                FullName = "Support Operator",
                RoleId = supportStaffRoleId,
                IsActive = true,
                CreatedAt = seedDate,
                CreatedBy = "System"
            },
            new AdminUser
            {
                Id = Guid.Parse("99999999-9999-9999-9999-999999999999"),
                ClerkUserId = "", // Link dynamically on first login
                Email = "wave.ambray@nextstep-software.com",
                FullName = "Wave Ambray",
                RoleId = superAdminRoleId,
                IsActive = true,
                CreatedAt = seedDate,
                CreatedBy = "System"
            }
        );
    }
}
