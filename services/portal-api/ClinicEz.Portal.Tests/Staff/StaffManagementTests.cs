using ClinicEz.Portal.Application.Features.Staff.Commands;
using ClinicEz.Portal.Application.Features.Staff.Queries;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
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
    private readonly Mock<ITenantFeatureGuard> _guardMock;
    private readonly Guid _tenantId = Guid.NewGuid();
    private const string TenantSlug = "metro-clinic";

    public StaffManagementTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new ApplicationDbContext(options);
        _guardMock = new Mock<ITenantFeatureGuard>();

        // Seed tenant
        _context.Tenants.Add(new Tenant
        {
            Id = _tenantId,
            TenantSlug = TenantSlug,
            Name = "Metro Clinic",
            OwnerId = "owner_clerk_123",
            Email = "owner@metro.ph",
            FirstName = "Maria",
            LastName = "Santos",
            SubscriptionStatus = "TRIALING",
            SubscriptionPlanId = "starter",
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

    [Fact]
    public async Task GetTenantStaff_AutoBackfillsOwner_WhenNoStaffRecordsExist()
    {
        var handler = new GetTenantStaffQueryHandler(_context);
        var query = new GetTenantStaffQuery(TenantSlug);

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Single(result.Members);
        Assert.Equal("Owner", result.Members[0].Role);
        Assert.Equal("owner@metro.ph", result.Members[0].Email);
        Assert.Equal(1, result.Quota.CurrentCount);
        Assert.Equal(3, result.Quota.MaxAllowed);
        Assert.False(result.Quota.IsQuotaReached);
    }

    [Fact]
    public async Task InviteStaffMember_ValidRequest_CreatesPendingInvitation()
    {
        var handler = new InviteStaffMemberCommandHandler(_context, _guardMock.Object);
        var command = new InviteStaffMemberCommand(TenantSlug, "doctor@metro.ph", "Dr. Juan Dela Cruz", "Doctor");

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("doctor@metro.ph", result.Email);
        Assert.Equal("Doctor", result.Role);
        Assert.Equal("PendingInvitation", result.Status);

        _guardMock.Verify(g => g.EnsureCanCreateStaffAsync(_tenantId.ToString(), It.IsAny<CancellationToken>()), Times.Once);

        var memberInDb = await _context.StaffMembers.FirstOrDefaultAsync(s => s.Email == "doctor@metro.ph");
        Assert.NotNull(memberInDb);
        Assert.NotNull(memberInDb.InvitationToken);
        Assert.True(memberInDb.InvitationExpiresAt > DateTime.UtcNow);
    }

    [Fact]
    public async Task InviteStaffMember_DuplicateEmail_ThrowsInvalidOperationException()
    {
        // First invite
        var handler = new InviteStaffMemberCommandHandler(_context, _guardMock.Object);
        await handler.Handle(new InviteStaffMemberCommand(TenantSlug, "nurse@metro.ph", "Nurse Joy", "Nurse"), CancellationToken.None);

        // Duplicate invite
        var duplicateCommand = new InviteStaffMemberCommand(TenantSlug, "nurse@metro.ph", "Nurse Joy 2", "Nurse");

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(duplicateCommand, CancellationToken.None));

        Assert.Contains("already exists", ex.Message);
    }

    [Fact]
    public async Task InviteStaffMember_WhenQuotaReached_GuardsAndThrows()
    {
        _guardMock.Setup(g => g.EnsureCanCreateStaffAsync(_tenantId.ToString(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("Feature Limit Reached: Your current plan only allows up to 3 staff members."));

        var handler = new InviteStaffMemberCommandHandler(_context, _guardMock.Object);
        var command = new InviteStaffMemberCommand(TenantSlug, "newstaff@metro.ph", "New Staff", "Staff");

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(command, CancellationToken.None));

        Assert.Contains("Feature Limit Reached", ex.Message);
    }

    [Fact]
    public async Task RevokeStaffMember_ValidMember_RemovesSuccessfully()
    {
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "reception@metro.ph",
            FullName = "Receptionist Ray",
            Role = "Receptionist",
            Status = "Active",
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "owner_clerk_123"
        };
        _context.StaffMembers.Add(staff);
        await _context.SaveChangesAsync();

        var handler = new RevokeStaffMemberCommandHandler(_context);
        var result = await handler.Handle(new RevokeStaffMemberCommand(TenantSlug, staff.Id), CancellationToken.None);

        Assert.True(result);
        var inDb = await _context.StaffMembers.FirstOrDefaultAsync(s => s.Id == staff.Id);
        Assert.Null(inDb);
    }

    [Fact]
    public async Task RevokeStaffMember_CannotRevokeOwner_ThrowsInvalidOperationException()
    {
        var owner = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "owner@metro.ph",
            FullName = "Maria Santos",
            Role = "Owner",
            Status = "Active",
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "owner_clerk_123"
        };
        _context.StaffMembers.Add(owner);
        await _context.SaveChangesAsync();

        var handler = new RevokeStaffMemberCommandHandler(_context);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new RevokeStaffMemberCommand(TenantSlug, owner.Id), CancellationToken.None));

        Assert.Contains("cannot be revoked", ex.Message);
    }

    [Fact]
    public async Task GetInvitationDetails_ValidToken_ReturnsMetadata()
    {
        var token = Guid.NewGuid().ToString("N");
        var member = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "candidate@metro.ph",
            FullName = "Dr. Clara Osmeña",
            Role = "Doctor",
            Status = "PendingInvitation",
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "owner_clerk_123"
        };
        _context.StaffMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = new GetInvitationDetailsQueryHandler(_context);
        var result = await handler.Handle(new GetInvitationDetailsQuery(token), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Metro Clinic", result.TenantName);
        Assert.Equal("candidate@metro.ph", result.InviteeEmail);
        Assert.Equal("Dr. Clara Osmeña", result.InviteeFullName);
        Assert.Equal("Doctor", result.Role);
        Assert.False(result.IsExpired);
        Assert.False(result.IsAlreadyAccepted);
    }

    [Fact]
    public async Task AcceptInvitation_ValidToken_LinksClerkUserIdAndActivates()
    {
        var token = Guid.NewGuid().ToString("N");
        var member = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "doctor.clara@metro.ph",
            FullName = "Dr. Clara Osmeña",
            Role = "Doctor",
            Status = "PendingInvitation",
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "owner_clerk_123"
        };
        _context.StaffMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = new AcceptInvitationCommandHandler(_context);
        var result = await handler.Handle(new AcceptInvitationCommand(token, "clerk_user_clara_999", "doctor.clara@metro.ph"), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(TenantSlug, result.TenantSlug);
        Assert.Equal("Doctor", result.Role);

        var memberInDb = await _context.StaffMembers.FindAsync(member.Id);
        Assert.NotNull(memberInDb);
        Assert.Equal("Active", memberInDb.Status);
        Assert.Equal("clerk_user_clara_999", memberInDb.UserId);
        Assert.NotNull(memberInDb.JoinedAt);
    }

    [Fact]
    public async Task AcceptInvitation_ExpiredToken_ThrowsInvalidOperationException()
    {
        var token = Guid.NewGuid().ToString("N");
        var member = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "expired@metro.ph",
            FullName = "Nurse Expired",
            Role = "Nurse",
            Status = "PendingInvitation",
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(-2), // Expired 2 days ago
            CreatedAt = DateTime.UtcNow.AddDays(-9),
            CreatedBy = "owner_clerk_123"
        };
        _context.StaffMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = new AcceptInvitationCommandHandler(_context);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptInvitationCommand(token, "clerk_user_any"), CancellationToken.None));

        Assert.Contains("expired", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ResendStaffInvitation_PendingMember_GeneratesFreshTokenAndExtendsExpiry()
    {
        var originalToken = "original_token_123";
        var originalExpiry = DateTime.UtcNow.AddDays(-1); // was expired
        var member = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "nurse.renew@metro.ph",
            FullName = "Nurse Renew",
            Role = "Nurse",
            Status = "PendingInvitation",
            InvitationToken = originalToken,
            InvitationExpiresAt = originalExpiry,
            CreatedAt = DateTime.UtcNow.AddDays(-8),
            CreatedBy = "owner_clerk_123"
        };
        _context.StaffMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = new ResendStaffInvitationCommandHandler(_context);
        var result = await handler.Handle(new ResendStaffInvitationCommand(TenantSlug, member.Id), CancellationToken.None);

        Assert.NotNull(result);
        Assert.NotEqual(originalToken, result.InvitationToken);
        Assert.NotNull(result.InvitationExpiresAt);
        Assert.True(result.InvitationExpiresAt > DateTime.UtcNow.AddDays(6));

        var inDb = await _context.StaffMembers.FindAsync(member.Id);
        Assert.NotNull(inDb);
        Assert.Equal(result.InvitationToken, inDb.InvitationToken);
        Assert.True(inDb.InvitationExpiresAt > DateTime.UtcNow);
    }
}
