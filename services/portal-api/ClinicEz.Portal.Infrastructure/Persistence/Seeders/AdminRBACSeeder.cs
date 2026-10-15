using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Domain.Constants;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.Portal.Infrastructure.Persistence.Seeders;

public class AdminRBACSeeder : IBaseSeeder
{
    public const string BootstrapSuperAdminEmail = "wave.ambray@nextstep-software.com";

    private readonly ApplicationDbContext _context;
    private readonly IHostEnvironment? _environment;

    public AdminRBACSeeder(ApplicationDbContext context, IHostEnvironment? environment = null)
    {
        _context = context;
        _environment = environment;
    }

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        var seedDate = new DateTime(2026, 7, 12, 0, 0, 0, DateTimeKind.Utc);
        var isDevelopment = _environment == null || _environment.IsDevelopment();

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

        // Always bootstrap the primary production Super Admin account in every environment
        var bootstrapUserId = Guid.Parse("99999999-9999-9999-9999-999999999999");
        var existingBootstrapUser = await _context.AdminUsers
            .FirstOrDefaultAsync(
                u => u.Id == bootstrapUserId || u.Email.ToLower() == BootstrapSuperAdminEmail,
                cancellationToken);

        if (existingBootstrapUser == null)
        {
            _context.AdminUsers.Add(new AdminUser
            {
                Id = bootstrapUserId,
                ClerkUserId = "",
                Email = BootstrapSuperAdminEmail,
                FullName = "Wave Ambray",
                RoleId = superAdminRoleId,
                IsActive = true,
                CreatedAt = seedDate,
                CreatedBy = "System"
            });
        }
        else
        {
            existingBootstrapUser.RoleId = superAdminRoleId;
            existingBootstrapUser.IsActive = true;
        }

        if (isDevelopment)
        {
            var devUsers = new[]
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
                }
            };

            foreach (var user in devUsers)
            {
                if (!await _context.AdminUsers.AnyAsync(u => u.Id == user.Id || u.Email.ToLower() == user.Email, cancellationToken))
                {
                    _context.AdminUsers.Add(user);
                }
            }
        }

        await _context.SaveChangesAsync(cancellationToken);
    }
}

