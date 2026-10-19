using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Admin.Queries;
using ClinicEz.Portal.Domain.Constants;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.Persistence.Seeders;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Portal.Tests.Features.Admin;

public class AdminRoleManagementTests
{
    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new ApplicationDbContext(options);
    }

    [Fact]
    public async Task AdminRBACSeeder_UpdatesExistingSuperAdmin_WhenPermissionsAdded()
    {
        using var db = CreateDbContext();
        var superAdminRoleId = Guid.Parse("44444444-4444-4444-4444-444444444444");

        // Seed with old 7 permissions only
        db.AdminRoles.Add(new AdminRole
        {
            Id = superAdminRoleId,
            Name = "Super Admin",
            Description = "Old description",
            Permissions = new List<string> { Permissions.ViewAnalytics, Permissions.ViewTenants }
        });
        await db.SaveChangesAsync();

        var seeder = new AdminRBACSeeder(db);
        await seeder.SeedAsync();

        var updatedSuperAdmin = await db.AdminRoles.FindAsync(superAdminRoleId);
        Assert.NotNull(updatedSuperAdmin);
        Assert.Contains(Permissions.ManagePlans, updatedSuperAdmin.Permissions);
        Assert.Contains(Permissions.ManageSettings, updatedSuperAdmin.Permissions);
        Assert.Equal(Permissions.All.Count, updatedSuperAdmin.Permissions.Count);
    }

    [Fact]
    public async Task GetAdminMeQueryHandler_SuperAdmin_AlwaysInheritsAllPermissions()
    {
        using var db = CreateDbContext();
        var superAdminRoleId = Guid.Parse("44444444-4444-4444-4444-444444444444");

        db.AdminRoles.Add(new AdminRole
        {
            Id = superAdminRoleId,
            Name = "Super Admin",
            Description = "Full Control",
            Permissions = new List<string> { Permissions.ViewAnalytics } // missing manage:plans
        });

        var adminUser = new AdminUser
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_clerk_123",
            Email = "admin@clinicez.net",
            FullName = "Admin User",
            RoleId = superAdminRoleId,
            IsActive = true
        };
        db.AdminUsers.Add(adminUser);
        await db.SaveChangesAsync();

        var handler = new GetAdminMeQueryHandler(db);
        var response = await handler.Handle(new GetAdminMeQuery("user_clerk_123", null), CancellationToken.None);

        Assert.NotNull(response);
        Assert.Contains(Permissions.ManagePlans, response.Permissions);
        Assert.Contains(Permissions.ManageSettings, response.Permissions);
        Assert.Equal(Permissions.All.Count, response.Permissions.Count);

        // Verify persisted to DB as well
        var dbRole = await db.AdminRoles.FindAsync(superAdminRoleId);
        Assert.NotNull(dbRole);
        Assert.Contains(Permissions.ManagePlans, dbRole.Permissions);
    }

    [Fact]
    public async Task UpdateAdminRoleCommand_UpdatesPermissions_AndKeepsSuperAdminComplete()
    {
        using var db = CreateDbContext();
        var customRoleId = Guid.NewGuid();

        db.AdminRoles.Add(new AdminRole
        {
            Id = customRoleId,
            Name = "Billing Agent",
            Description = "Manages Billing",
            Permissions = new List<string> { Permissions.ViewTenants }
        });
        await db.SaveChangesAsync();

        var handler = new UpdateAdminRoleCommandHandler(db);
        var updated = await handler.Handle(new UpdateAdminRoleCommand(
            customRoleId,
            "Billing Lead",
            "Updated Description",
            new List<string> { Permissions.ViewTenants, Permissions.ManagePlans, Permissions.ToggleSubscription },
            "SuperAdmin"
        ), CancellationToken.None);

        Assert.NotNull(updated);
        Assert.Equal("Billing Lead", updated.Name);
        Assert.Contains(Permissions.ManagePlans, updated.Permissions);
        Assert.Equal(3, updated.Permissions.Count);

        // If someone attempts to update Super Admin to have 0 permissions, it maintains Permissions.All
        var superAdminRoleId = Guid.Parse("44444444-4444-4444-4444-444444444444");
        db.AdminRoles.Add(new AdminRole
        {
            Id = superAdminRoleId,
            Name = "Super Admin",
            Description = "Super Admin",
            Permissions = new List<string>(Permissions.All)
        });
        await db.SaveChangesAsync();

        var superAdminUpdate = await handler.Handle(new UpdateAdminRoleCommand(
            superAdminRoleId,
            "Super Admin",
            "Updated Super Admin",
            new List<string> { Permissions.ViewAnalytics }, // tried to strip other permissions
            "SuperAdmin"
        ), CancellationToken.None);

        Assert.NotNull(superAdminUpdate);
        Assert.Equal(Permissions.All.Count, superAdminUpdate.Permissions.Count);
        Assert.Contains(Permissions.ManagePlans, superAdminUpdate.Permissions);
    }

    [Fact]
    public async Task DeleteAdminRoleCommand_GuardsSuperAdminAndAssignedRoles()
    {
        using var db = CreateDbContext();
        var superAdminRoleId = Guid.Parse("44444444-4444-4444-4444-444444444444");
        var customRoleId = Guid.NewGuid();

        db.AdminRoles.AddRange(
            new AdminRole { Id = superAdminRoleId, Name = "Super Admin", Permissions = new List<string>(Permissions.All) },
            new AdminRole { Id = customRoleId, Name = "Support Tier 2", Permissions = new List<string> { Permissions.ViewTenants } }
        );

        db.AdminUsers.Add(new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "support@clinicez.net",
            FullName = "Support User",
            RoleId = customRoleId,
            IsActive = true
        });

        await db.SaveChangesAsync();

        var handler = new DeleteAdminRoleCommandHandler(db);

        // 1. Cannot delete Super Admin
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new DeleteAdminRoleCommand(superAdminRoleId, "SuperAdmin"), CancellationToken.None));

        // 2. Cannot delete role with assigned users
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new DeleteAdminRoleCommand(customRoleId, "SuperAdmin"), CancellationToken.None));

        // 3. Unassigned role can be deleted
        var unassignedRoleId = Guid.NewGuid();
        db.AdminRoles.Add(new AdminRole { Id = unassignedRoleId, Name = "Temporary Role", Permissions = new List<string> { Permissions.ViewAnalytics } });
        await db.SaveChangesAsync();

        var success = await handler.Handle(new DeleteAdminRoleCommand(unassignedRoleId, "SuperAdmin"), CancellationToken.None);
        Assert.True(success);
        var deletedRole = await db.AdminRoles.FindAsync(unassignedRoleId);
        Assert.Null(deletedRole);
    }
}
