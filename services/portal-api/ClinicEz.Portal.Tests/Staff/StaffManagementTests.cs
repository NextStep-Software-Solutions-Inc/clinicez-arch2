using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Staff.Commands;
using ClinicEz.Portal.Application.Features.Staff.Queries;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using Microsoft.EntityFrameworkCore;
using Moq;
using System;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace ClinicEz.Portal.Tests.Staff;

public class StaffManagementTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly Mock<IEntitlementGuard> _guardMock;
    private readonly Mock<IClerkMetadataSync> _clerkMock = new();
    private readonly Guid _tenantId = Guid.NewGuid();
    private const string TenantSlug = "metro-clinic";

    public StaffManagementTests()
    {
        _context = TestSupport.NewContext();
        _guardMock = new Mock<IEntitlementGuard>();

        _context.Tenants.Add(new Tenant
        {
            Id = _tenantId,
            TenantSlug = TenantSlug,
            Name = "Metro Clinic",
            OwnerId = "owner_clerk_123",
            Email = "owner@metro.ph",
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

    private InviteStaffMemberCommandHandler InviteHandler() =>
        new(_context, _guardMock.Object, TestSupport.InvitationNotifier(_context), TimeProvider.System);

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
    public async Task GetTenantStaff_ListsMembers_AndQuotaFromPlanMemberLimit()
    {
        TestSupport.Entitlements(_context);
        SeedMember("owner@metro.ph", "Maria Santos", WorkspaceMemberRole.Owner, MemberStatus.Active, userId: "owner_clerk_123");
        var handler = new GetTenantStaffQueryHandler(_context, TestSupport.Entitlements(_context));

        var result = await handler.Handle(new GetTenantStaffQuery(TenantSlug), CancellationToken.None);

        Assert.NotNull(result);
        var owner = Assert.Single(result.Members);
        Assert.Equal("Owner", owner.Role);
        Assert.Equal("owner@metro.ph", owner.Email);
        Assert.Equal(1, result.Quota.CurrentCount);
        Assert.Equal(5, result.Quota.MaxAllowed);
        Assert.False(result.Quota.IsQuotaReached);
    }

    [Fact]
    public async Task InviteStaffMember_ValidRequest_CreatesPendingInvitation()
    {
        var command = new InviteStaffMemberCommand(TenantSlug, "biller@metro.ph", "Bob Biller", "Biller");

        var result = await InviteHandler().Handle(command, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("biller@metro.ph", result.Email);
        Assert.Equal("Billing", result.Role);
        Assert.Equal("PendingInvitation", result.Status);

        _guardMock.Verify(g => g.EnsureCanAddMemberAsync(_tenantId, It.IsAny<CancellationToken>()), Times.Once);

        var memberInDb = await _context.WorkspaceMembers.FirstOrDefaultAsync(s => s.Email == "biller@metro.ph");
        Assert.NotNull(memberInDb);
        Assert.Equal(WorkspaceMemberRole.Billing, memberInDb.Role);
        Assert.Equal(MemberStatus.Invited, memberInDb.Status);
        Assert.NotNull(memberInDb.InvitationToken);
        Assert.True(memberInDb.InvitationExpiresAt > DateTime.UtcNow);
    }

    [Fact]
    public async Task InviteStaffMember_FacilityAdministrator_CreatesPendingInvitationWithFacilityProfile()
    {
        var facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Name = "BGC Laboratory Branch",
            FacilityType = ClinicEz.Shared.Common.FacilityType.Laboratory,
            Status = FacilityStatus.Active
        };
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();

        var command = new InviteStaffMemberCommand(TenantSlug, "facadmin@metro.ph", "Mark Bautista", "Facility Administrator", facility.Id);

        var result = await InviteHandler().Handle(command, CancellationToken.None);

        Assert.Equal("facadmin@metro.ph", result.Email);
        Assert.Equal("Facility Administrator", result.Role);
        Assert.Equal(facility.Id, result.FacilityId);
        Assert.Equal("BGC Laboratory Branch", result.FacilityName);
        Assert.Equal("PendingInvitation", result.Status);

        var member = await _context.WorkspaceMembers.SingleAsync(m => m.Email == "facadmin@metro.ph");
        Assert.Equal(WorkspaceMemberRole.Member, member.Role);
        var profile = await _context.StaffMembers.SingleAsync(p => p.WorkspaceMemberId == member.Id);
        Assert.Equal(facility.Id, profile.FacilityId);
        Assert.Equal("Facility Administrator", profile.Role);
    }

    [Fact]
    public async Task InviteStaffMember_DuplicateEmail_ThrowsInvalidOperationException()
    {
        var handler = InviteHandler();
        await handler.Handle(new InviteStaffMemberCommand(TenantSlug, "admin2@metro.ph", "Alice Admin", "Admin"), CancellationToken.None);

        var duplicateCommand = new InviteStaffMemberCommand(TenantSlug, "admin2@metro.ph", "Alice Admin 2", "Admin");

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(duplicateCommand, CancellationToken.None));

        Assert.Contains("already exists", ex.Message);
    }

    [Fact]
    public async Task InviteStaffMember_WhenMemberLimitReached_GuardsAndThrows()
    {
        _guardMock.Setup(g => g.EnsureCanAddMemberAsync(_tenantId, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new EntitlementException("Your current plan only allows up to 3 members.", EntitlementGuard.LimitReachedCode));

        var command = new InviteStaffMemberCommand(TenantSlug, "viewer@metro.ph", "Vic Viewer", "Viewer");

        var ex = await Assert.ThrowsAsync<EntitlementException>(() => InviteHandler().Handle(command, CancellationToken.None));

        Assert.Equal(EntitlementGuard.LimitReachedCode, ex.Code);
        Assert.Empty(_context.WorkspaceMembers);
    }

    [Fact]
    public async Task RevokeStaffMember_ValidMember_RemovesSuccessfully_AndSyncsClerk()
    {
        var member = SeedMember("finance@metro.ph", "Finance Officer", WorkspaceMemberRole.Billing, MemberStatus.Active, userId: "clerk_fin");

        var handler = new RevokeStaffMemberCommandHandler(_context, _clerkMock.Object);
        var result = await handler.Handle(new RevokeStaffMemberCommand(TenantSlug, member.Id), CancellationToken.None);

        Assert.True(result);
        Assert.Null(await _context.WorkspaceMembers.FirstOrDefaultAsync(s => s.Id == member.Id));
        _clerkMock.Verify(c => c.SyncAsync("clerk_fin", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task RevokeStaffMember_CannotRevokeOwner_ThrowsInvalidOperationException()
    {
        var owner = SeedMember("owner@metro.ph", "Maria Santos", WorkspaceMemberRole.Owner, MemberStatus.Active, userId: "owner_clerk_123");

        var handler = new RevokeStaffMemberCommandHandler(_context, _clerkMock.Object);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new RevokeStaffMemberCommand(TenantSlug, owner.Id), CancellationToken.None));

        Assert.Contains("cannot be revoked", ex.Message);
    }

    [Fact]
    public async Task GetInvitationDetails_ValidToken_ReturnsMetadata()
    {
        var token = Guid.NewGuid().ToString("N");
        SeedMember("candidate@metro.ph", "Clara Finance", WorkspaceMemberRole.Billing, MemberStatus.Invited, token, DateTime.UtcNow.AddDays(7));

        var handler = new GetInvitationDetailsQueryHandler(_context);
        var result = await handler.Handle(new GetInvitationDetailsQuery(token), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Metro Clinic", result.TenantName);
        Assert.Equal("candidate@metro.ph", result.InviteeEmail);
        Assert.Equal("Clara Finance", result.InviteeFullName);
        Assert.Equal("Billing", result.Role);
        Assert.False(result.IsExpired);
        Assert.False(result.IsAlreadyAccepted);
    }

    [Fact]
    public async Task AcceptInvitation_ValidToken_LinksClerkUserIdAndActivates_WithoutGrantingOwnership()
    {
        var token = Guid.NewGuid().ToString("N");
        var member = SeedMember("admin.clara@metro.ph", "Clara Admin", WorkspaceMemberRole.Admin, MemberStatus.Invited, token, DateTime.UtcNow.AddDays(7));

        var handler = new AcceptInvitationCommandHandler(_context, _clerkMock.Object, TimeProvider.System);
        var result = await handler.Handle(new AcceptInvitationCommand(token, "clerk_user_clara_999", "admin.clara@metro.ph"), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(TenantSlug, result.TenantSlug);
        Assert.Equal("Admin", result.Role);

        var memberInDb = await _context.WorkspaceMembers.FindAsync(member.Id);
        Assert.NotNull(memberInDb);
        Assert.Equal(MemberStatus.Active, memberInDb.Status);
        Assert.Equal("clerk_user_clara_999", memberInDb.UserId);
        Assert.NotNull(memberInDb.JoinedAt);

        Assert.Equal("owner_clerk_123", (await _context.Tenants.SingleAsync()).OwnerId);
        _clerkMock.Verify(c => c.SyncAsync("clerk_user_clara_999", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task AcceptInvitation_ExpiredToken_ThrowsInvalidOperationException()
    {
        var token = Guid.NewGuid().ToString("N");
        SeedMember("expired@metro.ph", "Viewer Expired", WorkspaceMemberRole.Member, MemberStatus.Invited, token, DateTime.UtcNow.AddDays(-2));

        var handler = new AcceptInvitationCommandHandler(_context, _clerkMock.Object, TimeProvider.System);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptInvitationCommand(token, "clerk_user_any"), CancellationToken.None));

        Assert.Contains("expired", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ResendStaffInvitation_PendingMember_GeneratesFreshTokenAndExtendsExpiry()
    {
        var originalToken = "original_token_123";
        var member = SeedMember("biller.renew@metro.ph", "Biller Renew", WorkspaceMemberRole.Billing, MemberStatus.Invited, originalToken, DateTime.UtcNow.AddDays(-1));

        var handler = new ResendStaffInvitationCommandHandler(_context, TestSupport.InvitationNotifier(_context), TimeProvider.System);
        var result = await handler.Handle(new ResendStaffInvitationCommand(TenantSlug, member.Id), CancellationToken.None);

        Assert.NotNull(result);
        Assert.NotEqual(originalToken, result.InvitationToken);
        Assert.NotNull(result.InvitationExpiresAt);
        Assert.True(result.InvitationExpiresAt > DateTime.UtcNow.AddDays(6));

        var inDb = await _context.WorkspaceMembers.FindAsync(member.Id);
        Assert.NotNull(inDb);
        Assert.Equal(result.InvitationToken, inDb.InvitationToken);
        Assert.True(inDb.InvitationExpiresAt > DateTime.UtcNow);
    }
}
