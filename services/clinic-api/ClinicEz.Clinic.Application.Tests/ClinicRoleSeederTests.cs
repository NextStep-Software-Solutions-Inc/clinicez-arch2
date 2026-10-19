using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ClinicRoleSeederTests
{
    [Fact]
    public async Task SeedOrUpdateAllClinicsAsync_BackfillsAuditPermissionsToExistingAdminRole()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        // Seed an outdated Clinic Administrator role missing audit:read and audit:export
        var outdatedPermissions = ClinicPermissions.All
            .Where(p => p != ClinicPermissions.AuditRead && p != ClinicPermissions.AuditExport)
            .ToList();

        var adminRole = new ClinicRole
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Clinic Administrator",
            IsSystem = true,
            Permissions = outdatedPermissions
        };
        await context.ClinicRoles.AddAsync(adminRole);
        await context.SaveChangesAsync();

        // Run multi-clinic startup synchronization
        var updatedCount = await ClinicRoleSeeder.SeedOrUpdateAllClinicsAsync(context, null, CancellationToken.None);

        updatedCount.Should().Be(1);

        var refreshedAdminRole = await context.ClinicRoles.FirstAsync(r => r.Id == adminRole.Id);
        refreshedAdminRole.Permissions.Should().Contain(ClinicPermissions.AuditRead);
        refreshedAdminRole.Permissions.Should().Contain(ClinicPermissions.AuditExport);
        refreshedAdminRole.Permissions.Should().BeEquivalentTo(ClinicPermissions.All);
    }

    [Fact]
    public async Task SeedOrUpdateAllClinicsAsync_SeedsDataProtectionOfficerRole()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        // Pre-existing clinic with only Clinic Administrator
        var adminRole = new ClinicRole
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Clinic Administrator",
            IsSystem = true,
            Permissions = new List<string>(ClinicPermissions.All)
        };
        await context.ClinicRoles.AddAsync(adminRole);
        await context.SaveChangesAsync();

        await ClinicRoleSeeder.SeedOrUpdateAllClinicsAsync(context, null, CancellationToken.None);

        var dpoRole = await context.ClinicRoles.FirstOrDefaultAsync(r =>
            r.ClinicId == clinicId && r.Name == ClinicRoleSeeder.DpoRoleName && r.IsSystem);

        dpoRole.Should().NotBeNull();
        dpoRole!.Permissions.Should().Contain(ClinicPermissions.AuditRead);
        dpoRole.Permissions.Should().Contain(ClinicPermissions.AuditExport);
        dpoRole.Permissions.Should().Contain(ClinicPermissions.ReportsRead);
        dpoRole.Permissions.Should().Contain(ClinicPermissions.SettingsRead);
        dpoRole.Permissions.Should().Contain(ClinicPermissions.PatientsRead);
    }

    [Fact]
    public async Task SeedOrUpdateAllClinicsAsync_DoesNotModifyCustomRoles()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var customRoleId = Guid.NewGuid();
        var customRole = new ClinicRole
        {
            Id = customRoleId,
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Custom Auditor",
            IsSystem = false,
            Permissions = new List<string> { ClinicPermissions.ReportsRead }
        };
        await context.ClinicRoles.AddAsync(customRole);
        await context.SaveChangesAsync();

        await ClinicRoleSeeder.SeedOrUpdateAllClinicsAsync(context, null, CancellationToken.None);

        var refreshedCustomRole = await context.ClinicRoles.FirstAsync(r => r.Id == customRoleId);
        refreshedCustomRole.Permissions.Should().Equal(new[] { ClinicPermissions.ReportsRead });
        refreshedCustomRole.IsSystem.Should().BeFalse();
    }

    [Fact]
    public async Task SeedOrUpdateAllClinicsAsync_IsIdempotent()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        // First run creates system roles
        var firstRun = await ClinicRoleSeeder.SeedOrUpdateAllClinicsAsync(context, null, CancellationToken.None);
        
        // Populate one clinic
        await ClinicRoleSeeder.SeedDefaultRolesForClinicAsync(context, tenantId, clinicId, CancellationToken.None);

        // Second run
        var secondRun = await ClinicRoleSeeder.SeedOrUpdateAllClinicsAsync(context, null, CancellationToken.None);
        secondRun.Should().Be(0);

        // Third run
        var thirdRun = await ClinicRoleSeeder.SeedOrUpdateAllClinicsAsync(context, null, CancellationToken.None);
        thirdRun.Should().Be(0);
    }
}
