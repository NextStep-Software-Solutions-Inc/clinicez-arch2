using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MainPortalBE.Domain.Constants;
using MainPortalBE.Domain.Entities;
using MainPortalBE.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace MainPortalBE.Infrastructure.Persistence.Seeders;

public class AdminRBACSeeder : IBaseSeeder
{
    private readonly ApplicationDbContext _context;

    public AdminRBACSeeder(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        var seedDate = new DateTime(2026, 7, 12, 0, 0, 0, DateTimeKind.Utc);
        
        var superAdminRoleId = Guid.Parse("44444444-4444-4444-4444-444444444444");
        var supportStaffRoleId = Guid.Parse("55555555-5555-5555-5555-555555555555");
        var contentWriterRoleId = Guid.Parse("66666666-6666-6666-6666-666666666666");

        var roles = new[]
        {
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
        };

        foreach (var role in roles)
        {
            if (!await _context.AdminRoles.AnyAsync(r => r.Id == role.Id, cancellationToken))
            {
                _context.AdminRoles.Add(role);
            }
        }

        var users = new[]
        {
            new AdminUser
            {
                Id = Guid.Parse("77777777-7777-7777-7777-777777777777"),
                ClerkUserId = "",
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
                ClerkUserId = "",
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
                ClerkUserId = "",
                Email = "wave.ambray@nextstep-software.com",
                FullName = "Wave Ambray",
                RoleId = superAdminRoleId,
                IsActive = true,
                CreatedAt = seedDate,
                CreatedBy = "System"
            }
        };

        foreach (var user in users)
        {
            if (!await _context.AdminUsers.AnyAsync(u => u.Id == user.Id, cancellationToken))
            {
                _context.AdminUsers.Add(user);
            }
        }

        await _context.SaveChangesAsync(cancellationToken);
    }
}
