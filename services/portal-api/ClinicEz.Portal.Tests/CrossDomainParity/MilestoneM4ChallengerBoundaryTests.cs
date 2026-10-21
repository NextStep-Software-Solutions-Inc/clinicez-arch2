using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Admin.DTOs;
using ClinicEz.Portal.Application.Features.Staff;
using ClinicEz.Portal.Application.Features.Staff.Commands;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;
using ClinicEz.Portal.Tests.Support;

namespace ClinicEz.Portal.Tests.CrossDomainParity;

public class MilestoneM4ChallengerBoundaryTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private const string FrontendUrl = "https://portal.clinicez.test";
    private readonly FixedFrontendUrl _urlProvider = new(FrontendUrl);

    public MilestoneM4ChallengerBoundaryTests()
    {
        _context = TestSupport.NewContext();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public void SchemaIntegrity_AdminUserStatus_And_MemberStatus_NeverContainExpired()
    {
        var adminStatuses = Enum.GetNames<AdminUserStatus>();
        var memberStatuses = Enum.GetNames<MemberStatus>();

        Assert.Equal(4, adminStatuses.Length);
        Assert.DoesNotContain("Expired", adminStatuses);
        Assert.Equal(["Invited", "Active", "Suspended", "Revoked"], adminStatuses);

        Assert.Equal(4, memberStatuses.Length);
        Assert.DoesNotContain("Expired", memberStatuses);
        Assert.Equal(["Invited", "Active", "Suspended", "Revoked"], memberStatuses);
    }

    [Fact]
    public void Tier1_DynamicExpiration_BoundaryProbing_1msBeforeAndAfter()
    {
        var now = DateTime.UtcNow;

        // 1ms in the future -> not expired -> "Invited"
        var futureUser = new AdminUser
        {
            Status = AdminUserStatus.Invited,
            InvitationExpiresAt = now.AddMilliseconds(1)
        };
        var futureDto = AdminUserMapping.ToDto(futureUser, new FixedTimeProvider(now));
        Assert.Equal("Invited", futureDto.DisplayStatus);
        Assert.Equal(AdminUserStatus.Invited, futureDto.Status);

        // 1ms in the past -> expired -> "Expired"
        var pastUser = new AdminUser
        {
            Status = AdminUserStatus.Invited,
            InvitationExpiresAt = now.AddMilliseconds(-1)
        };
        var pastDto = AdminUserMapping.ToDto(pastUser, new FixedTimeProvider(now));
        Assert.Equal("Expired", pastDto.DisplayStatus);
        Assert.Equal(AdminUserStatus.Invited, pastDto.Status);
    }

    [Fact]
    public void Tier2_DynamicExpiration_BoundaryProbing_1msBeforeAndAfter()
    {
        var now = DateTime.UtcNow;

        // 1ms in future -> "Invited"
        var futureStatus = StaffMemberMapping.StatusName(MemberStatus.Invited, now.AddMilliseconds(1), now);
        Assert.Equal("Invited", futureStatus);

        // 1ms in past -> "Expired"
        var pastStatus = StaffMemberMapping.StatusName(MemberStatus.Invited, now.AddMilliseconds(-1), now);
        Assert.Equal("Expired", pastStatus);
    }

    [Fact]
    public async Task Tier1_AcceptAdminInvitation_ExpiredToken_ThrowsInvalidOperationException()
    {
        var now = DateTime.UtcNow;
        var role = new AdminRole
        {
            Id = Guid.NewGuid(),
            Name = "Support Staff",
            Description = "Support",
            Permissions = new List<string> { "view:analytics" }
        };
        _context.AdminRoles.Add(role);

        var token = "expired_tok_t1_" + Guid.NewGuid().ToString("N");
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "expired.t1@clinicez.test",
            FullName = "Expired T1 User",
            RoleId = role.Id,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = now.AddMilliseconds(-10),
            CreatedAt = now.AddDays(-7),
            CreatedBy = "admin@clinicez.test"
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, _urlProvider, TimeProvider.System);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptAdminInvitationCommand(token, "clerk_123"), CancellationToken.None));

        Assert.Equal("This invitation has expired.", ex.Message);
    }

    [Fact]
    public async Task Tier1_AcceptAdminInvitation_RevokedToken_ThrowsInvalidOperationException()
    {
        var now = DateTime.UtcNow;
        var role = new AdminRole
        {
            Id = Guid.NewGuid(),
            Name = "Support Staff",
            Description = "Support",
            Permissions = new List<string> { "view:analytics" }
        };
        _context.AdminRoles.Add(role);

        var token = "revoked_tok_t1_" + Guid.NewGuid().ToString("N");
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "revoked.t1@clinicez.test",
            FullName = "Revoked T1 User",
            RoleId = role.Id,
            Status = AdminUserStatus.Revoked,
            InvitationToken = token,
            InvitationExpiresAt = now.AddDays(5),
            CreatedAt = now.AddDays(-2),
            CreatedBy = "admin@clinicez.test"
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, _urlProvider, TimeProvider.System);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptAdminInvitationCommand(token, "clerk_123"), CancellationToken.None));

        Assert.Equal("This invitation has been revoked.", ex.Message);
    }

    [Fact]
    public async Task Tier2_AcceptWorkspaceInvitation_ExpiredToken_ThrowsInvalidOperationException()
    {
        var now = DateTime.UtcNow;
        var tenant = new Tenant { Id = Guid.NewGuid(), Name = "Acme Clinic", TenantSlug = "acme-clinic" };
        _context.Tenants.Add(tenant);

        var token = "expired_tok_t2_" + Guid.NewGuid().ToString("N");
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            Email = "expired.t2@clinicez.test",
            FullName = "Expired T2 Member",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = now.AddMilliseconds(-10),
            CreatedAt = now.AddDays(-7),
            CreatedBy = "owner@clinicez.test"
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = new AcceptInvitationCommandHandler(_context, TestSupport.NoClerkSync(), TimeProvider.System);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptInvitationCommand(token, "clerk_456", "expired.t2@clinicez.test"), CancellationToken.None));

        Assert.Contains("expired", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Tier2_AcceptWorkspaceInvitation_RevokedToken_ThrowsInvalidOperationException()
    {
        var now = DateTime.UtcNow;
        var tenant = new Tenant { Id = Guid.NewGuid(), Name = "Acme Clinic", TenantSlug = "acme-clinic" };
        _context.Tenants.Add(tenant);

        var token = "revoked_tok_t2_" + Guid.NewGuid().ToString("N");
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            Email = "revoked.t2@clinicez.test",
            FullName = "Revoked T2 Member",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Revoked,
            InvitationToken = token,
            InvitationExpiresAt = now.AddDays(5),
            CreatedAt = now.AddDays(-1),
            CreatedBy = "owner@clinicez.test"
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = new AcceptInvitationCommandHandler(_context, TestSupport.NoClerkSync(), TimeProvider.System);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptInvitationCommand(token, "clerk_456", "revoked.t2@clinicez.test"), CancellationToken.None));

        Assert.Equal("This invitation has been revoked.", ex.Message);
    }

    [Fact]
    public async Task Tier1_AcceptAdminInvitation_PreservesOriginalAuditCreatedAtAndCreatedBy()
    {
        var originalCreated = DateTime.UtcNow.AddDays(-2);
        const string originalCreator = "original.admin@clinicez.test";
        var role = new AdminRole
        {
            Id = Guid.NewGuid(),
            Name = "Support Staff",
            Description = "Support",
            Permissions = new List<string> { "view:analytics" }
        };
        _context.AdminRoles.Add(role);

        var token = "valid_audit_tok_" + Guid.NewGuid().ToString("N");
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "audit.admin@clinicez.test",
            FullName = "Audit Admin",
            RoleId = role.Id,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(5),
            CreatedAt = originalCreated,
            CreatedBy = originalCreator
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, _urlProvider, TimeProvider.System);
        var result = await handler.Handle(new AcceptAdminInvitationCommand(token, "clerk_audit_user"), CancellationToken.None);

        Assert.Equal(AdminUserStatus.Active, result.Status);
        Assert.Equal(originalCreated, result.CreatedAt);
        Assert.Equal(originalCreator, result.CreatedBy);
        Assert.NotNull(result.JoinedAt);
    }

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(utcNow, TimeSpan.Zero);
    }
}
