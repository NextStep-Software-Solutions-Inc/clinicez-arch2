using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ClinicRoleSeederTests
{
    [Fact]
    public void CanonicalDoctorRoleTemplate_IncludesTriageWritePermission()
    {
        var templates = ClinicRoleSeeder.GetCanonicalSystemRoleTemplates();
        var doctorTemplate = templates.SingleOrDefault(t => t.Name == ClinicRoleSeeder.DoctorRoleName);

        doctorTemplate.Should().NotBeNull();
        doctorTemplate!.Permissions.Should().Contain(ClinicPermissions.TriageRead);
        doctorTemplate.Permissions.Should().Contain(ClinicPermissions.TriageWrite);
        doctorTemplate.Permissions.Should().Contain(ClinicPermissions.ConsultationsWrite);
        doctorTemplate.Permissions.Should().Contain(ClinicPermissions.ConsultationsSign);
    }

    [Fact]
    public async Task SeedOrUpdateAllClinicsAsync_BackfillsTriageWritePermissionToExistingDoctorRole()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        // Seed an outdated Attending Physician / Doctor system role missing triage:write
        var outdatedDoctorPermissions = new List<string>
        {
            ClinicPermissions.AppointmentsRead,
            ClinicPermissions.QueueRead,
            ClinicPermissions.QueueCall,
            ClinicPermissions.QueueComplete,
            ClinicPermissions.TriageRead,
            ClinicPermissions.ConsultationsRead,
            ClinicPermissions.ConsultationsWrite,
            ClinicPermissions.ConsultationsSign,
            ClinicPermissions.PatientsRead
        };

        var doctorRole = new ClinicRole
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = ClinicRoleSeeder.DoctorRoleName,
            IsSystem = true,
            Permissions = outdatedDoctorPermissions
        };
        await context.ClinicRoles.AddAsync(doctorRole);
        await context.SaveChangesAsync();

        // Run multi-clinic startup synchronization
        var updatedCount = await ClinicRoleSeeder.SeedOrUpdateAllClinicsAsync(context, null, CancellationToken.None);

        updatedCount.Should().Be(1);

        var refreshedDoctorRole = await context.ClinicRoles.FirstAsync(r => r.Id == doctorRole.Id);
        refreshedDoctorRole.Permissions.Should().Contain(ClinicPermissions.TriageWrite);
    }

    [Fact]
    public async Task HasPermissionAttribute_WithMultiplePermissions_EnforcesStrictAndSemantics()
    {
        var attr = new HasPermissionAttribute(ClinicPermissions.TriageWrite, ClinicPermissions.ConsultationsWrite);

        // Case 1: Only has ConsultationsWrite (missing TriageWrite) -> must fail with 403 Forbidden (AND, not OR)
        var partialContext = Substitute.For<IClinicContext>();
        partialContext.HasPermission(ClinicPermissions.TriageWrite).Returns(false);
        partialContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(true);

        var services1 = new ServiceCollection().AddSingleton(partialContext).BuildServiceProvider();
        var httpContext1 = new DefaultHttpContext { RequestServices = services1 };
        var actionContext1 = new ActionContext(httpContext1, new RouteData(), new ActionDescriptor());
        var executingContext1 = new ActionExecutingContext(
            actionContext1,
            new List<IFilterMetadata>(),
            new Dictionary<string, object?>(),
            controller: new object());

        var nextCalled1 = false;
        await attr.OnActionExecutionAsync(executingContext1, () =>
        {
            nextCalled1 = true;
            return Task.FromResult(new ActionExecutedContext(actionContext1, new List<IFilterMetadata>(), new object()));
        });

        nextCalled1.Should().BeFalse();
        executingContext1.Result.Should().BeOfType<ObjectResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status403Forbidden);

        // Case 2: Has BOTH TriageWrite AND ConsultationsWrite -> succeeds
        var fullContext = Substitute.For<IClinicContext>();
        fullContext.HasPermission(ClinicPermissions.TriageWrite).Returns(true);
        fullContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(true);

        var services2 = new ServiceCollection().AddSingleton(fullContext).BuildServiceProvider();
        var httpContext2 = new DefaultHttpContext { RequestServices = services2 };
        var actionContext2 = new ActionContext(httpContext2, new RouteData(), new ActionDescriptor());
        var executingContext2 = new ActionExecutingContext(
            actionContext2,
            new List<IFilterMetadata>(),
            new Dictionary<string, object?>(),
            controller: new object());

        var nextCalled2 = false;
        await attr.OnActionExecutionAsync(executingContext2, () =>
        {
            nextCalled2 = true;
            return Task.FromResult(new ActionExecutedContext(actionContext2, new List<IFilterMetadata>(), new object()));
        });

        nextCalled2.Should().BeTrue();
        executingContext2.Result.Should().BeNull();
    }

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
