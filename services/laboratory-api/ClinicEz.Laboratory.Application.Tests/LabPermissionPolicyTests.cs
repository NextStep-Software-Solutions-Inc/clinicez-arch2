using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Domain.Constants;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Laboratory.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;

namespace ClinicEz.Laboratory.Application.Tests;

public class LabPermissionPolicyTests
{
    [Fact]
    public void LabAdmin_HasEveryPermission()
    {
        LabRolePermissions.For(LabStaffRole.LabAdmin).Should().BeEquivalentTo(LabPermissions.All);
    }

    [Fact]
    public void EveryRole_HasANonEmptySubsetOfAllPermissions()
    {
        foreach (var role in Enum.GetValues<LabStaffRole>())
        {
            var permissions = LabRolePermissions.For(role);
            permissions.Should().NotBeEmpty(role.ToString());
            permissions.Should().OnlyContain(p => LabPermissions.All.Contains(p), role.ToString());
        }
    }

    [Fact]
    public void OnlyAdminAndPathologist_CanVerifyReports()
    {
        var verifiers = Enum.GetValues<LabStaffRole>()
            .Where(r => LabRolePermissions.For(r).Contains(LabPermissions.ReportsVerify)).ToList();

        verifiers.Should().BeEquivalentTo(new[] { LabStaffRole.LabAdmin, LabStaffRole.Pathologist });
    }

    [Fact]
    public void OnlyAdmin_CanManageStaff()
    {
        Enum.GetValues<LabStaffRole>()
            .Where(r => LabRolePermissions.For(r).Contains(LabPermissions.StaffManage))
            .Should().BeEquivalentTo(new[] { LabStaffRole.LabAdmin });
    }

    [Fact]
    public void Technician_RunsWorklistSpecimensResultsAndQc_ButCannotVerify()
    {
        var p = LabRolePermissions.For(LabStaffRole.MedicalTechnologist);

        p.Should().Contain(new[]
        {
            LabPermissions.RequisitionsRead, LabPermissions.SpecimensAccession, LabPermissions.SpecimensManage,
            LabPermissions.ResultsWrite, LabPermissions.AnalyzersFeed, LabPermissions.QcRead, LabPermissions.QcWrite
        });
        p.Should().NotContain(LabPermissions.ReportsVerify).And.NotContain(LabPermissions.StaffManage);
    }

    [Fact]
    public void Clerk_IsLimitedToRequisitionIntake()
    {
        LabRolePermissions.For(LabStaffRole.LabClerk).Should().BeEquivalentTo(new[]
        {
            LabPermissions.RequisitionsRead, LabPermissions.SpecimensAccession
        });
    }

    [Fact]
    public void Phlebotomist_CannotEnterResultsOrTouchReportsAndQc()
    {
        var p = LabRolePermissions.For(LabStaffRole.Phlebotomist);

        p.Should().NotContain(LabPermissions.ResultsWrite).And.NotContain(LabPermissions.ReportsRead)
            .And.NotContain(LabPermissions.QcWrite).And.NotContain(LabPermissions.StaffRead);
    }

    [Fact]
    public void InternalServices_NeverGetResultsStaffOrVerifyPermissions()
    {
        LabPermissions.InternalService.Should().NotContain(new[]
        {
            LabPermissions.ResultsWrite, LabPermissions.ReportsVerify, LabPermissions.StaffManage, LabPermissions.StaffRead
        });
    }

    // ── tenant isolation at the data layer ───────────────────────────────────────────

    private static ApplicationDbContext CreateDb(string name, ILabContext? context)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "laboratory_dashboard") })
            .Build();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseInMemoryDatabase(name).Options;
        return new ApplicationDbContext(options, config, context);
    }

    [Fact]
    public async Task AuthenticatedStaff_OnlySeeRowsOfTheirOwnTenant_WhileSystemScopeSeesAll()
    {
        var name = $"Lab_Tenant_{Guid.NewGuid()}";
        await using (var seed = CreateDb(name, null))
        {
            seed.LabRequisitions.Add(new LabRequisition { Id = Guid.NewGuid(), TenantId = "tenant-a", AccessionNumber = "ACC-A", PatientName = "A" });
            seed.LabRequisitions.Add(new LabRequisition { Id = Guid.NewGuid(), TenantId = "tenant-b", AccessionNumber = "ACC-B", PatientName = "B" });
            await seed.SaveChangesAsync();
        }

        var staffContext = Substitute.For<ILabContext>();
        staffContext.TenantId.Returns("tenant-a");
        await using var asStaff = CreateDb(name, staffContext);
        (await asStaff.LabRequisitions.Select(r => r.AccessionNumber).ToListAsync()).Should().Equal("ACC-A");

        // A staff session whose token lacks a tenant matches nothing (fail closed).
        var broken = Substitute.For<ILabContext>();
        broken.TenantId.Returns(string.Empty);
        await using var asBroken = CreateDb(name, broken);
        (await asBroken.LabRequisitions.CountAsync()).Should().Be(0);

        // Background consumers / Hangfire have no HTTP principal and keep working across tenants.
        await using var system = CreateDb(name, null);
        (await system.LabRequisitions.CountAsync()).Should().Be(2);
    }
}
