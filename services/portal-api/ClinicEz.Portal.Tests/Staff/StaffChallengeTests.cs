using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Features.Staff.Commands;
using ClinicEz.Portal.Application.Features.Staff.Queries;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Moq;
using System;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace ClinicEz.Portal.Tests.Staff;

public class StaffChallengeTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly Mock<IEntitlementGuard> _guardMock;
    private readonly Mock<IClerkMetadataSync> _clerkMock = new();
    private readonly Guid _tenantId = Guid.NewGuid();
    private const string TenantSlug = "challenge-clinic";

    public StaffChallengeTests()
    {
        _context = TestSupport.NewContext();
        _guardMock = new Mock<IEntitlementGuard>();

        _context.Tenants.Add(new Tenant
        {
            Id = _tenantId,
            TenantSlug = TenantSlug,
            Name = "Challenge Clinic",
            OwnerId = "owner_clerk_123",
            Email = "owner@challenge.ph",
            FirstName = "Maria",
            LastName = "Santos",
            StaffAccountsCount = 1,
            CreatedAt = DateTime.UtcNow
        });
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private WorkspaceMember SeedMember(
        string email,
        string name,
        WorkspaceMemberRole role,
        MemberStatus status,
        string? token = null,
        DateTime? tokenExpiry = null,
        string? userId = null)
    {
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            UserId = userId,
            Email = email,
            FullName = name,
            Role = role,
            Status = status,
            InvitationToken = token,
            InvitationExpiresAt = tokenExpiry,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "owner_clerk_123"
        };
        _context.WorkspaceMembers.Add(member);
        _context.SaveChanges();
        return member;
    }

    [Fact]
    public async Task Challenge_SuspendedMember_CannotAcceptInvitation()
    {
        var token = "token_suspended_test";
        var member = SeedMember("suspended@test.com", "Suspended Test", WorkspaceMemberRole.Member, MemberStatus.Suspended, token, DateTime.UtcNow.AddDays(5));

        var handler = new AcceptInvitationCommandHandler(_context, _clerkMock.Object, TimeProvider.System);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptInvitationCommand(token, "clerk_suspended_user"), CancellationToken.None));

        Assert.Equal("This account is suspended.", ex.Message);
    }

    [Fact]
    public async Task Challenge_RevokedMember_CannotAcceptInvitation()
    {
        var token = "token_revoked_test";
        var member = SeedMember("revoked@test.com", "Revoked Test", WorkspaceMemberRole.Member, MemberStatus.Revoked, token, DateTime.UtcNow.AddDays(5));

        var handler = new AcceptInvitationCommandHandler(_context, _clerkMock.Object, TimeProvider.System);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptInvitationCommand(token, "clerk_revoked_user"), CancellationToken.None));

        Assert.Equal("This invitation has been revoked.", ex.Message);
    }

    [Fact]
    public async Task Challenge_ExpiredInvitation_CannotBeAccepted_ThrowsInvalidOperationException()
    {
        var token = "token_expired_test";
        var member = SeedMember("expired@test.com", "Expired Test", WorkspaceMemberRole.Member, MemberStatus.Invited, token, DateTime.UtcNow.AddDays(-1));

        var handler = new AcceptInvitationCommandHandler(_context, _clerkMock.Object, TimeProvider.System);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptInvitationCommand(token, "clerk_expired_user"), CancellationToken.None));

        Assert.Contains("This invitation has expired", ex.Message);
    }

    [Fact]
    public async Task Challenge_ReinvitingRevokedMember_ReactivatesWithFreshTokenAndExpiry()
    {
        var oldToken = "old_revoked_token";
        var member = SeedMember("reinvite@test.com", "Old Revoked", WorkspaceMemberRole.Member, MemberStatus.Revoked, oldToken, DateTime.UtcNow.AddDays(-5));

        var handler = new InviteStaffMemberCommandHandler(_context, _guardMock.Object, TestSupport.InvitationNotifier(_context), TimeProvider.System);
        var result = await handler.Handle(new InviteStaffMemberCommand(TenantSlug, "reinvite@test.com", "Fresh Name", "Admin", SendEmail: true), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Invited", result.Status);
        Assert.Equal("Admin", result.Role);

        var inDb = await _context.WorkspaceMembers.FindAsync(member.Id);
        Assert.NotNull(inDb);
        Assert.Equal(MemberStatus.Invited, inDb.Status);
        Assert.Equal("Fresh Name", inDb.FullName);
        Assert.NotEqual(oldToken, inDb.InvitationToken);
        Assert.NotNull(inDb.InvitationExpiresAt);
        Assert.True(inDb.InvitationExpiresAt > DateTime.UtcNow);
    }

    [Fact]
    public async Task Challenge_ReactivatingSuspendedMember_VerifiesPlanSeatLimits()
    {
        var member = SeedMember("suspended_limit@test.com", "Suspended Guy", WorkspaceMemberRole.Billing, MemberStatus.Suspended, userId: "clerk_user_123");

        _guardMock.Setup(g => g.EnsureCanAddMemberAsync(_tenantId, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new EntitlementException("Plan limit reached", EntitlementGuard.LimitReachedCode));

        var handler = new ReactivateStaffMemberCommandHandler(_context, _guardMock.Object, _clerkMock.Object, TimeProvider.System);
        var ex = await Assert.ThrowsAsync<EntitlementException>(() =>
            handler.Handle(new ReactivateStaffMemberCommand(TenantSlug, member.Id), CancellationToken.None));

        Assert.Equal(EntitlementGuard.LimitReachedCode, ex.Code);

        // Member status should remain Suspended
        var inDb = await _context.WorkspaceMembers.FindAsync(member.Id);
        Assert.NotNull(inDb);
        Assert.Equal(MemberStatus.Suspended, inDb.Status);
    }

    [Fact]
    public async Task Challenge_SuspendedMember_CannotResendInvitation()
    {
        var member = SeedMember("suspended_resend@test.com", "Suspended Guy", WorkspaceMemberRole.Billing, MemberStatus.Suspended, userId: "clerk_user_123");

        var handler = new ResendStaffInvitationCommandHandler(_context, TestSupport.InvitationNotifier(_context), TimeProvider.System);

        // A suspended member should NOT be allowed to be resent an invitation!
        // Resend is only for Invited / Expired invitations.
        // If Resend succeeds on a suspended member, it turns them back to Invited, bypassing suspension!
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new ResendStaffInvitationCommand(TenantSlug, member.Id), CancellationToken.None));
    }

    [Fact]
    public async Task ExploitProof_SuspendedMember_Resend_BypassesSuspensionAndQuota()
    {
        // 1. A member is suspended
        var member = SeedMember("bypassed@test.com", "Suspended Person", WorkspaceMemberRole.Billing, MemberStatus.Suspended, userId: "clerk_user_bypassed");

        // 2. Resend is executed on this suspended member - now blocked!
        var resendHandler = new ResendStaffInvitationCommandHandler(_context, TestSupport.InvitationNotifier(_context), TimeProvider.System);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            resendHandler.Handle(new ResendStaffInvitationCommand(TenantSlug, member.Id), CancellationToken.None));

        Assert.Equal("Suspended accounts cannot be resent an invitation. Please reactivate the account.", ex.Message);

        // 3. Member status remains Suspended in DB
        var inDbAfterResend = await _context.WorkspaceMembers.FindAsync(member.Id);
        Assert.NotNull(inDbAfterResend);
        Assert.Equal(MemberStatus.Suspended, inDbAfterResend.Status);
    }

    [Fact]
    public async Task ExploitProof_RevokedMember_Resend_BypassesRevocationAndQuota()
    {
        // 1. A member is revoked
        var member = SeedMember("revoked_bypassed@test.com", "Revoked Person", WorkspaceMemberRole.Billing, MemberStatus.Revoked);

        // 2. Resend is executed on this revoked member - now blocked!
        var resendHandler = new ResendStaffInvitationCommandHandler(_context, TestSupport.InvitationNotifier(_context), TimeProvider.System);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            resendHandler.Handle(new ResendStaffInvitationCommand(TenantSlug, member.Id), CancellationToken.None));

        Assert.Equal("Revoked invitations cannot be resent. Please send a new invitation.", ex.Message);

        // 3. Member status remains Revoked in DB
        var inDbAfterResend = await _context.WorkspaceMembers.FindAsync(member.Id);
        Assert.NotNull(inDbAfterResend);
        Assert.Equal(MemberStatus.Revoked, inDbAfterResend.Status);
    }
}
