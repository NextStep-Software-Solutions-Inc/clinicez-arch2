using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Roles.Commands;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Context;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class PermissionPolicyTests
{
    [Fact]
    public async Task CreateClinicRole_Success_ReturnsNewRoleWithPermissions()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roleRepo = TestDbHelper.CreateRepository<ClinicRole>(context, sieve);

        var handler = new CreateClinicRoleCommandHandler(roleRepo, uow, clinicContext);
        var permissions = new List<string> { ClinicPermissions.QueueRead, ClinicPermissions.QueueCheckIn };

        // Act
        var result = await handler.Handle(new CreateClinicRoleCommand("Front Desk Level 2", "Custom front desk role", permissions), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Name.Should().Be("Front Desk Level 2");
        result.Permissions.Should().Contain(ClinicPermissions.QueueRead);
        result.Permissions.Should().Contain(ClinicPermissions.QueueCheckIn);
        result.IsSystem.Should().BeFalse();

        var savedRole = await context.ClinicRoles.FirstOrDefaultAsync(r => r.Id == result.Id);
        savedRole.Should().NotBeNull();
        savedRole!.Name.Should().Be("Front Desk Level 2");
        savedRole.Permissions.Should().HaveCount(2);
    }

    [Fact]
    public void ClinicContext_HasPermission_ValidatesPermissionsCorrectly()
    {
        // Permissions come only from validated token claims. A forged X-Permissions header must be ignored.
        var httpContextAccessor = Substitute.For<IHttpContextAccessor>();
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers["X-Permissions"] = $"{ClinicPermissions.ConsultationsSign},*";
        httpContext.User = new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity(
            new[]
            {
                new System.Security.Claims.Claim(ClinicClaimTypes.Subject, Guid.NewGuid().ToString()),
                new System.Security.Claims.Claim(ClinicClaimTypes.TenantId, "tenant_test"),
                new System.Security.Claims.Claim(ClinicClaimTypes.ClinicId, Guid.NewGuid().ToString()),
                new System.Security.Claims.Claim(ClinicClaimTypes.Permission, ClinicPermissions.QueueCheckIn),
                new System.Security.Claims.Claim(ClinicClaimTypes.Permission, ClinicPermissions.TriageWrite)
            },
            "Facility"));
        httpContextAccessor.HttpContext.Returns(httpContext);

        var config = new ConfigurationBuilder().Build();
        var context = new ClinicContext(httpContextAccessor, config);

        // Act & Assert
        context.HasPermission(ClinicPermissions.QueueCheckIn).Should().BeTrue();
        context.HasPermission(ClinicPermissions.TriageWrite).Should().BeTrue();
        context.HasPermission(ClinicPermissions.ConsultationsSign).Should().BeFalse();
    }

    [Fact]
    public void CreateClinicRoleCommandValidator_Rejects_InvalidPermissions()
    {
        var validator = new CreateClinicRoleCommandValidator();
        var command = new CreateClinicRoleCommand(
            "Test Role",
            "Description",
            new List<string> { ClinicPermissions.QueueRead, "invalid:permission:hack" });

        var result = validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.Contains("invalid:permission:hack"));
    }

    [Fact]
    public void CreateClinicRoleCommandValidator_Accepts_AllValidPermissions()
    {
        var validator = new CreateClinicRoleCommandValidator();
        var command = new CreateClinicRoleCommand(
            "Super Custom Role",
            "Description",
            new List<string>(ClinicPermissions.All));

        var result = validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void UpdateClinicRoleCommandValidator_Rejects_InvalidPermissions()
    {
        var validator = new UpdateClinicRoleCommandValidator();
        var command = new UpdateClinicRoleCommand(
            Guid.NewGuid(),
            "Updated Role",
            "Description",
            new List<string> { "nonexistent:permission" });

        var result = validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.Contains("nonexistent:permission"));
    }

    [Fact]
    public async Task UpdateClinicRoleCommandHandler_ThrowsBadRequest_WhenRoleIsSystem()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roleRepo = TestDbHelper.CreateRepository<ClinicRole>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var systemRole = new ClinicRole
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "System Doctor",
            IsSystem = true,
            Permissions = new List<string> { ClinicPermissions.ConsultationsRead }
        };
        await context.ClinicRoles.AddAsync(systemRole);
        await context.SaveChangesAsync();

        var handler = new UpdateClinicRoleCommandHandler(roleRepo, staffRepo, uow, clinicContext);
        var command = new UpdateClinicRoleCommand(systemRole.Id, "Hacked Doctor", null, new List<string> { ClinicPermissions.ConsultationsRead });

        var act = () => handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.BadRequestException>()
            .WithMessage("*Default system roles cannot be modified*");
    }

    [Fact]
    public async Task UpdateClinicRoleCommandHandler_ThrowsValidationException_WhenCallerAssignedToCustomRole()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var callerStaffId = Guid.NewGuid();
        var customRoleId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(callerStaffId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roleRepo = TestDbHelper.CreateRepository<ClinicRole>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var customRole = new ClinicRole
        {
            Id = customRoleId,
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Custom Operations Lead",
            IsSystem = false,
            Permissions = new List<string> { ClinicPermissions.RolesManage, ClinicPermissions.StaffManage }
        };
        await context.ClinicRoles.AddAsync(customRole);

        await context.StaffMembers.AddAsync(new StaffMember
        {
            Id = callerStaffId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Caller",
            LastName = "Lead",
            ClinicRoleId = customRoleId,
            IsActive = true
        });
        await context.SaveChangesAsync();

        var handler = new UpdateClinicRoleCommandHandler(roleRepo, staffRepo, uow, clinicContext);
        var command = new UpdateClinicRoleCommand(
            customRoleId,
            "Custom Operations Lead",
            "Downgraded permissions",
            new List<string> { ClinicPermissions.QueueRead });

        var act = () => handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>()
            .WithMessage("*cannot modify or downgrade your own assigned clinic role*");
    }
}

