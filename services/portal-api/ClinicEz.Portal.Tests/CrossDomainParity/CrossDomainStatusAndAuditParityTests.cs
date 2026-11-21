using System;
using System.Linq;
using ClinicEz.Portal.Application.Features.Admin.DTOs;
using ClinicEz.Portal.Application.Features.Staff;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Portal.Tests.CrossDomainParity;

/// <summary>
/// Milestone 4 Cross-Domain Alignment Verification:
/// Verifies standardized status tracking, dynamic expiration, and audit timestamps
/// for Tier 1 (Platform Admin) and Tier 2 (Tenant Workspace Team).
/// </summary>
public class CrossDomainStatusAndAuditParityTests
{
    private static readonly string[] ExpectedCorePersistedStatuses = ["Invited", "Active", "Suspended", "Revoked"];

    [Fact]
    public void Tier1_AdminUserStatus_HasExactlyFourCorePersistedStatuses_AndNeverPersistsExpired()
    {
        var names = Enum.GetNames<AdminUserStatus>();

        Assert.Equal(4, names.Length);
        Assert.Equal(ExpectedCorePersistedStatuses, names);
        Assert.DoesNotContain("Expired", names);
    }

    [Fact]
    public void Tier2_MemberStatus_HasExactlyFourCorePersistedStatuses_AndNeverPersistsExpired()
    {
        var names = Enum.GetNames<MemberStatus>();

        Assert.Equal(4, names.Length);
        Assert.Equal(ExpectedCorePersistedStatuses, names);
        Assert.DoesNotContain("Expired", names);
    }

    [Fact]
    public void Tier1_AdminUser_PersistsAllRequiredAuditTimestamps()
    {
        var now = DateTime.UtcNow;
        var expires = now.AddDays(7);
        var joined = now.AddMinutes(15);

        var adminUser = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "admin.audit@clinicez.com",
            FullName = "Admin Audit User",
            Status = AdminUserStatus.Invited,
            CreatedAt = now,
            CreatedBy = "superadmin@clinicez.com",
            InvitationExpiresAt = expires,
            JoinedAt = joined
        };

        Assert.Equal(now, adminUser.CreatedAt);
        Assert.Equal("superadmin@clinicez.com", adminUser.CreatedBy);
        Assert.Equal(expires, adminUser.InvitationExpiresAt);
        Assert.Equal(joined, adminUser.JoinedAt);
    }

    [Fact]
    public void Tier2_WorkspaceMember_PersistsAllRequiredAuditTimestamps()
    {
        var now = DateTime.UtcNow;
        var expires = now.AddDays(7);
        var joined = now.AddMinutes(20);

        var workspaceMember = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = Guid.NewGuid(),
            Email = "workspace.audit@clinicez.com",
            FullName = "Workspace Audit Member",
            Status = MemberStatus.Invited,
            CreatedAt = now,
            CreatedBy = "owner@clinicez.com",
            InvitationExpiresAt = expires,
            JoinedAt = joined
        };

        Assert.Equal(now, workspaceMember.CreatedAt);
        Assert.Equal("owner@clinicez.com", workspaceMember.CreatedBy);
        Assert.Equal(expires, workspaceMember.InvitationExpiresAt);
        Assert.Equal(joined, workspaceMember.JoinedAt);
    }

    [Fact]
    public void Tier1_AdminUserMapping_DynamicallyResolvesExpiredWithoutMutatingPersistedStatus()
    {
        var now = DateTime.UtcNow;
        var expiredTime = now.AddMinutes(-10);

        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "expired.admin@clinicez.com",
            FullName = "Expired Admin",
            Status = AdminUserStatus.Invited,
            InvitationToken = "tok_hex_64_test",
            InvitationExpiresAt = expiredTime,
            CreatedAt = now.AddDays(-7),
            CreatedBy = "system"
        };

        var dto = AdminUserMapping.ToDto(user, null, "https://portal.clinicez.ph");

        // Dynamic status should resolve to Expired
        Assert.Equal("Expired", dto.DisplayStatus);
        // Persisted enum status remains unchanged as Invited
        Assert.Equal(AdminUserStatus.Invited, dto.Status);
        Assert.Equal(user.CreatedAt, dto.CreatedAt);
        Assert.Equal(user.CreatedBy, dto.CreatedBy);
        Assert.Equal(expiredTime, dto.InvitationExpiresAt);
    }

    [Fact]
    public void Tier1_AdminUserMapping_ResolvesActiveSuspendedAndRevokedAccurately()
    {
        var userActive = new AdminUser { Status = AdminUserStatus.Active };
        var dtoActive = AdminUserMapping.ToDto(userActive);
        Assert.Equal("Active", dtoActive.DisplayStatus);

        var userSuspended = new AdminUser { Status = AdminUserStatus.Suspended };
        var dtoSuspended = AdminUserMapping.ToDto(userSuspended);
        Assert.Equal("Suspended", dtoSuspended.DisplayStatus);

        var userRevoked = new AdminUser { Status = AdminUserStatus.Revoked };
        var dtoRevoked = AdminUserMapping.ToDto(userRevoked);
        Assert.Equal("Revoked", dtoRevoked.DisplayStatus);
    }

    [Fact]
    public void Tier2_StaffMemberMapping_DynamicallyResolvesExpiredWithoutMutatingPersistedStatus()
    {
        var now = DateTime.UtcNow;
        var expiredTime = now.AddMinutes(-5);

        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = Guid.NewGuid(),
            Email = "expired.team@clinicez.com",
            FullName = "Expired Team Member",
            Role = WorkspaceMemberRole.Billing,
            Status = MemberStatus.Invited,
            InvitationToken = "tok_workspace_hex_64",
            InvitationExpiresAt = expiredTime,
            CreatedAt = now.AddDays(-7),
            CreatedBy = "admin"
        };

        var resolvedStatus = StaffMemberMapping.StatusName(member.Status, member.InvitationExpiresAt, now);
        Assert.Equal("Expired", resolvedStatus);
        Assert.Equal(MemberStatus.Invited, member.Status);

        var dto = StaffMemberMapping.ToDto(member, null, null, now);
        Assert.Equal("Expired", dto.Status);
        Assert.Equal(member.CreatedAt, dto.CreatedAt);
        Assert.Equal(member.InvitationExpiresAt, dto.InvitationExpiresAt);
    }

    [Fact]
    public void Tier2_StaffMemberMapping_ResolvesActiveSuspendedAndRevokedAccurately()
    {
        var active = StaffMemberMapping.StatusName(MemberStatus.Active);
        Assert.Equal("Active", active);

        var suspended = StaffMemberMapping.StatusName(MemberStatus.Suspended);
        Assert.Equal("Suspended", suspended);

        var revoked = StaffMemberMapping.StatusName(MemberStatus.Revoked);
        Assert.Equal("Revoked", revoked);

        var futureInvite = StaffMemberMapping.StatusName(MemberStatus.Invited, DateTime.UtcNow.AddDays(3));
        Assert.Equal("Invited", futureInvite);
    }

    [Fact]
    public void PortalDbContext_ConfiguresStringConversions_ForAdminUserAndWorkspaceMemberStatuses()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        using var dbContext = new ApplicationDbContext(options);
        var model = dbContext.Model;

        var adminUserEntityType = model.FindEntityType(typeof(AdminUser));
        Assert.NotNull(adminUserEntityType);
        var adminStatusProp = adminUserEntityType.FindProperty(nameof(AdminUser.Status));
        Assert.NotNull(adminStatusProp);
        Assert.Equal(64, adminStatusProp.GetMaxLength());

        var memberEntityType = model.FindEntityType(typeof(WorkspaceMember));
        Assert.NotNull(memberEntityType);
        var memberStatusProp = memberEntityType.FindProperty(nameof(WorkspaceMember.Status));
        Assert.NotNull(memberStatusProp);
        Assert.Equal(16, memberStatusProp.GetMaxLength());
    }
}
