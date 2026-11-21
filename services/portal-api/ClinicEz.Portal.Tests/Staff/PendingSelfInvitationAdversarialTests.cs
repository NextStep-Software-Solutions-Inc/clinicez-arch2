using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Staff.Queries;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Staff;

public class PendingSelfInvitationAdversarialTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly Mock<IClerkUserLookup> _clerkLookupMock = new();
    private readonly Guid _tenantId1 = Guid.NewGuid();
    private readonly Guid _tenantId2 = Guid.NewGuid();
    private readonly Guid _tenantId3 = Guid.NewGuid();

    private class TestTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new DateTimeOffset(utcNow, TimeSpan.Zero);
    }

    public PendingSelfInvitationAdversarialTests()
    {
        _context = TestSupport.NewContext();

        _context.Tenants.AddRange(
            new Tenant
            {
                Id = _tenantId1,
                TenantSlug = "metro-east",
                Name = "Metro East Clinic",
                OwnerId = "owner_1",
                Email = "owner1@metro.ph",
                FirstName = "Maria",
                LastName = "Santos",
                CreatedAt = DateTime.UtcNow.AddMonths(-3)
            },
            new Tenant
            {
                Id = _tenantId2,
                TenantSlug = "metro-west",
                Name = "Metro West Clinic",
                OwnerId = "owner_2",
                Email = "owner2@metro.ph",
                FirstName = "Juan",
                LastName = "Dela Cruz",
                CreatedAt = DateTime.UtcNow.AddMonths(-2)
            },
            new Tenant
            {
                Id = _tenantId3,
                TenantSlug = "metro-central",
                Name = "Metro Central Clinic",
                OwnerId = "owner_3",
                Email = "owner3@metro.ph",
                FirstName = "Pedro",
                LastName = "Reyes",
                CreatedAt = DateTime.UtcNow.AddMonths(-1)
            }
        );
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private GetPendingSelfInvitationQueryHandler CreateHandler(DateTime? now = null) =>
        new(_context, _clerkLookupMock.Object, new TestTimeProvider(now ?? DateTime.UtcNow));

    // =========================================================================
    // 1. MULTIPLE PENDING WORKSPACE INVITATIONS (ORDERING & FILTERING)
    // =========================================================================

    [Fact]
    public async Task MultiplePendingInvitations_AcrossDifferentWorkspaces_ReturnsNewestValidWorkspace()
    {
        var fixedNow = new DateTime(2026, 10, 23, 12, 0, 0, DateTimeKind.Utc);
        var email = "multidisciplinary.doctor@metro.ph";

        var member1 = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId1,
            Email = email,
            FullName = "Dr. Multidisciplinary",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = "token_workspace_1_oldest",
            InvitationExpiresAt = fixedNow.AddDays(7),
            CreatedAt = fixedNow.AddDays(-3) // 3 days ago
        };

        var member2 = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId2,
            Email = email,
            FullName = "Dr. Multidisciplinary",
            Role = WorkspaceMemberRole.Billing,
            Status = MemberStatus.Invited,
            InvitationToken = "token_workspace_2_middle",
            InvitationExpiresAt = fixedNow.AddDays(7),
            CreatedAt = fixedNow.AddDays(-1) // 1 day ago
        };

        var member3 = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId3,
            Email = email,
            FullName = "Dr. Multidisciplinary",
            Role = WorkspaceMemberRole.Admin,
            Status = MemberStatus.Invited,
            InvitationToken = "token_workspace_3_newest",
            InvitationExpiresAt = fixedNow.AddDays(7),
            CreatedAt = fixedNow.AddHours(-1) // 1 hour ago (newest)
        };

        _context.WorkspaceMembers.AddRange(member1, member2, member3);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_multi_doc", new[] { email });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("token_workspace_3_newest", result.Token);
        Assert.Equal("metro-central", result.TenantSlug);
        Assert.Equal("Metro Central Clinic", result.WorkspaceName);
        Assert.Equal("Admin", result.Role);
    }

    [Fact]
    public async Task MultiplePendingInvitations_WhenNewestWorkspaceIsExpired_ReturnsNextNewestValidWorkspace()
    {
        var fixedNow = new DateTime(2026, 10, 23, 12, 0, 0, DateTimeKind.Utc);
        var email = "doc.fallback@metro.ph";

        var olderValidMember = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId1,
            Email = email,
            FullName = "Dr. Fallback",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = "token_valid_older",
            InvitationExpiresAt = fixedNow.AddDays(4), // Still valid for 4 days
            CreatedAt = fixedNow.AddDays(-2)
        };

        var newerExpiredMember = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId2,
            Email = email,
            FullName = "Dr. Fallback",
            Role = WorkspaceMemberRole.Admin,
            Status = MemberStatus.Invited,
            InvitationToken = "token_expired_newer",
            InvitationExpiresAt = fixedNow.AddHours(-1), // Expired 1 hour ago
            CreatedAt = fixedNow.AddHours(-2) // Newer than member1
        };

        _context.WorkspaceMembers.AddRange(olderValidMember, newerExpiredMember);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_doc_fallback", new[] { email });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("token_valid_older", result.Token);
        Assert.Equal("metro-east", result.TenantSlug);
    }

    [Fact]
    public async Task MultiplePendingInvitations_WhenNewestWorkspaceIsRevokedOrSuspended_ReturnsNextNewestValidWorkspace()
    {
        var fixedNow = new DateTime(2026, 10, 23, 12, 0, 0, DateTimeKind.Utc);
        var email = "doc.revoked.chain@metro.ph";

        var validOldest = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId1,
            Email = email,
            FullName = "Dr. Status Chain",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = "token_valid_oldest",
            InvitationExpiresAt = fixedNow.AddDays(5),
            CreatedAt = fixedNow.AddDays(-3)
        };

        var suspendedMiddle = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId2,
            Email = email,
            FullName = "Dr. Status Chain",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Suspended, // Suspended
            InvitationToken = "token_suspended_middle",
            InvitationExpiresAt = fixedNow.AddDays(5),
            CreatedAt = fixedNow.AddDays(-2)
        };

        var revokedNewest = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId3,
            Email = email,
            FullName = "Dr. Status Chain",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Revoked, // Revoked
            InvitationToken = "token_revoked_newest",
            InvitationExpiresAt = fixedNow.AddDays(5),
            CreatedAt = fixedNow.AddDays(-1)
        };

        _context.WorkspaceMembers.AddRange(validOldest, suspendedMiddle, revokedNewest);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_doc_status_chain", new[] { email });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("token_valid_oldest", result.Token);
        Assert.Equal("metro-east", result.TenantSlug);
    }

    [Fact]
    public async Task MultiplePendingInvitations_WhenNewestWorkspaceTenantIsArchived_ReturnsActiveWorkspace()
    {
        var fixedNow = new DateTime(2026, 10, 23, 12, 0, 0, DateTimeKind.Utc);
        var email = "doc.archived.chain@metro.ph";

        var archivedTenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "metro-archived-branch",
            Name = "Metro Archived Branch",
            OwnerId = "owner_archived",
            Email = "archived@metro.ph",
            FirstName = "Archived",
            LastName = "Branch",
            ArchivedAt = fixedNow.AddHours(-1), // Tenant was archived
            CreatedAt = fixedNow.AddMonths(-1)
        };
        _context.Tenants.Add(archivedTenant);

        var memberInArchivedTenant = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = archivedTenant.Id,
            Email = email,
            FullName = "Dr. Branch User",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = "token_archived_branch",
            InvitationExpiresAt = fixedNow.AddDays(5),
            CreatedAt = fixedNow.AddHours(-2) // Newer
        };

        var memberInActiveTenant = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId1,
            Email = email,
            FullName = "Dr. Branch User",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = "token_active_branch",
            InvitationExpiresAt = fixedNow.AddDays(5),
            CreatedAt = fixedNow.AddDays(-1) // Older
        };

        _context.WorkspaceMembers.AddRange(memberInArchivedTenant, memberInActiveTenant);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_archived_chain", new[] { email });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("token_active_branch", result.Token);
        Assert.Equal("metro-east", result.TenantSlug);
    }

    // =========================================================================
    // 2. PRECEDENCE: WORKSPACE VS ADMIN INVITATIONS
    // =========================================================================

    [Fact]
    public async Task Precedence_WorkspaceOverAdmin_EvenWhenAdminIsNewer()
    {
        var fixedNow = new DateTime(2026, 10, 23, 12, 0, 0, DateTimeKind.Utc);
        var email = "dual.candidate@metro.ph";

        var olderWorkspaceMember = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId1,
            Email = email,
            FullName = "Dual Candidate",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = "token_workspace_older",
            InvitationExpiresAt = fixedNow.AddDays(5),
            CreatedAt = fixedNow.AddDays(-2) // Older
        };

        var role = new AdminRole { Id = Guid.NewGuid(), Name = "Support Admin" };
        _context.AdminRoles.Add(role);

        var newerAdminUser = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = email,
            FullName = "Dual Candidate",
            RoleId = role.Id,
            Role = role,
            IsActive = true,
            Status = AdminUserStatus.Invited,
            InvitationToken = "token_admin_newer",
            InvitationExpiresAt = fixedNow.AddDays(5),
            CreatedAt = fixedNow.AddHours(-1) // Newer than workspace invite
        };

        _context.WorkspaceMembers.Add(olderWorkspaceMember);
        _context.AdminUsers.Add(newerAdminUser);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_dual", new[] { email });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Workspace", result.InvitationType);
        Assert.Equal("token_workspace_older", result.Token);
        Assert.Equal("metro-east", result.TenantSlug);
    }

    [Fact]
    public async Task Precedence_AdminReturned_WhenWorkspaceInvitationIsExpired()
    {
        var fixedNow = new DateTime(2026, 10, 23, 12, 0, 0, DateTimeKind.Utc);
        var email = "admin.fallback.user@metro.ph";

        var expiredWorkspaceMember = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId1,
            Email = email,
            FullName = "Admin Fallback User",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = "token_workspace_expired",
            InvitationExpiresAt = fixedNow.AddHours(-1), // Expired
            CreatedAt = fixedNow.AddDays(-5)
        };

        var role = new AdminRole { Id = Guid.NewGuid(), Name = "Compliance Officer" };
        _context.AdminRoles.Add(role);

        var validAdminUser = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = email,
            FullName = "Admin Fallback User",
            RoleId = role.Id,
            Role = role,
            IsActive = true,
            Status = AdminUserStatus.Invited,
            InvitationToken = "token_admin_valid_fallback",
            InvitationExpiresAt = fixedNow.AddDays(5),
            CreatedAt = fixedNow.AddDays(-4)
        };

        _context.WorkspaceMembers.Add(expiredWorkspaceMember);
        _context.AdminUsers.Add(validAdminUser);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_admin_fallback", new[] { email });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Admin", result.InvitationType);
        Assert.Equal("token_admin_valid_fallback", result.Token);
        Assert.Equal("Compliance Officer", result.Role);
    }

    [Fact]
    public async Task Precedence_AdminReturned_WhenWorkspaceInvitationIsRevoked()
    {
        var fixedNow = new DateTime(2026, 10, 23, 12, 0, 0, DateTimeKind.Utc);
        var email = "admin.revoked.ws@metro.ph";

        var revokedWorkspaceMember = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId1,
            Email = email,
            FullName = "Admin Revoked WS",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Revoked, // Revoked
            InvitationToken = "token_workspace_revoked",
            InvitationExpiresAt = fixedNow.AddDays(5),
            CreatedAt = fixedNow.AddDays(-1)
        };

        var role = new AdminRole { Id = Guid.NewGuid(), Name = "Billing Admin" };
        _context.AdminRoles.Add(role);

        var validAdminUser = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = email,
            FullName = "Admin Revoked WS",
            RoleId = role.Id,
            Role = role,
            IsActive = true,
            Status = AdminUserStatus.Invited,
            InvitationToken = "token_admin_valid_revoked_ws",
            InvitationExpiresAt = fixedNow.AddDays(5),
            CreatedAt = fixedNow.AddDays(-2)
        };

        _context.WorkspaceMembers.Add(revokedWorkspaceMember);
        _context.AdminUsers.Add(validAdminUser);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_admin_revoked_ws", new[] { email });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Admin", result.InvitationType);
        Assert.Equal("token_admin_valid_revoked_ws", result.Token);
    }

    // =========================================================================
    // 3. CASE SENSITIVITY AND COMPLEX EMAIL PERMUTATIONS
    // =========================================================================

    [Theory]
    [InlineData("Doctor.Smith@MetroHealth.PH", "doctor.smith@metrohealth.ph")]
    [InlineData("doctor.smith@metrohealth.ph", "DOCTOR.SMITH@METROHEALTH.PH")]
    [InlineData("Dr.Jane.Smith@MetroEast.PH", "dr.jane.smith@metroeast.ph")]
    [InlineData("NURSE.JOY@POKEMON.PH", "nurse.joy@pokemon.ph")]
    public async Task EmailCasing_AllPermutations_MatchCleanly(string dbEmail, string queryEmail)
    {
        var fixedNow = DateTime.UtcNow;
        var token = $"token_case_{Guid.NewGuid():N}";

        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId1,
            Email = dbEmail,
            FullName = "Case Test User",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = fixedNow.AddDays(7),
            CreatedAt = fixedNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_case_user", new[] { queryEmail });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(token, result.Token);
    }

    [Fact]
    public async Task SpecialCharactersInEmail_PlusAddressingAndDashes_MatchesAccurately()
    {
        var fixedNow = DateTime.UtcNow;
        var token = "token_special_email_char";
        var email = "doctor+emergency-shift@sub.metro-health.ph";

        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId1,
            Email = email,
            FullName = "Special Char User",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = fixedNow.AddDays(7),
            CreatedAt = fixedNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_special", new[] { "DOCTOR+EMERGENCY-SHIFT@SUB.METRO-HEALTH.PH" });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(token, result.Token);
    }

    // =========================================================================
    // 4. MULTIPLE VERIFIED EMAIL CLAIMS (OAUTH / MULTI-IDENTITY)
    // =========================================================================

    [Fact]
    public async Task MultipleVerifiedEmails_MatchesCorrectWorkspace_WhenUserHasPersonalAndInstitutionalEmails()
    {
        var fixedNow = DateTime.UtcNow;
        var token = "token_multi_verified_claims";
        var hospitalEmail = "dr.maria.santos@hospital.gov.ph";

        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId1,
            Email = hospitalEmail,
            FullName = "Dr. Maria Santos",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = fixedNow.AddDays(7),
            CreatedAt = fixedNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        // User authenticated via Google SSO, having primary personal email, university email, and hospital email
        var query = new GetPendingSelfInvitationQuery("clerk_maria_sso", new[]
        {
            "maria.personal@gmail.com",
            "maria.santos@up.edu.ph",
            "dr.maria.santos@hospital.gov.ph",
            "maria.recovery@yahoo.com"
        });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(token, result.Token);
        Assert.Equal(hospitalEmail, result.Email);
    }

    [Fact]
    public async Task WhitespaceSanitization_ExcessiveWhitespaceAndNewlinesInEmailClaims_IsSanitized()
    {
        var fixedNow = DateTime.UtcNow;
        var token = "token_whitespace_newline";
        var email = "clean.target@metrohealth.ph";

        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId1,
            Email = email,
            FullName = "Clean Target",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = fixedNow.AddDays(7),
            CreatedAt = fixedNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_white", new[]
        {
            " \t\r\n clean.target@metrohealth.ph \r\n\t "
        });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(token, result.Token);
    }

    // =========================================================================
    // 5. SECURITY & ANTI-ENUMERATION RE-VERIFICATION
    // =========================================================================

    [Fact]
    public async Task AntiEnumeration_AttackerCannotAccessVictimsInvitation()
    {
        var fixedNow = DateTime.UtcNow;
        var victimToken = "secret_victim_token_xyz987";
        var victimEmail = "victim.doctor@metrohealth.ph";

        var victimMember = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId1,
            Email = victimEmail,
            FullName = "Victim Doctor",
            Role = WorkspaceMemberRole.Admin,
            Status = MemberStatus.Invited,
            InvitationToken = victimToken,
            InvitationExpiresAt = fixedNow.AddDays(7),
            CreatedAt = fixedNow
        };
        _context.WorkspaceMembers.Add(victimMember);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);

        // Attacker logs in with their own account and presents only their own verified emails
        var query = new GetPendingSelfInvitationQuery("attacker_clerk_user", new[]
        {
            "attacker@malicious.com",
            "attacker.personal@darkweb.org"
        });

        var result = await handler.Handle(query, CancellationToken.None);

        // Result MUST be null, no token leakage occurs
        Assert.Null(result);
    }

    [Theory]
    [InlineData("'; DROP TABLE WorkspaceMembers; --")]
    [InlineData("' OR '1'='1")]
    [InlineData("\" OR 1=1 --")]
    [InlineData("<script>alert('xss')</script>")]
    public async Task SqlInjectionAndXss_InVerifiedEmails_DoesNotTriggerInjectionOrMatchArbitraryRecords(string maliciousInput)
    {
        var fixedNow = DateTime.UtcNow;
        var token = "secret_token_target";

        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId1,
            Email = "legit.user@metrohealth.ph",
            FullName = "Legit User",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = fixedNow.AddDays(7),
            CreatedAt = fixedNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_attacker_sqli", new[] { maliciousInput });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Null(result);
    }

    // =========================================================================
    // 6. CLERK USER LOOKUP FALLBACK AND RESILIENCE
    // =========================================================================

    [Fact]
    public async Task ClerkLookupFallback_WhenVerifiedEmailsListIsEmpty_CallsClerkLookup()
    {
        var fixedNow = DateTime.UtcNow;
        var token = "token_clerk_api_called";
        var email = "oauth.fallback@metrohealth.ph";

        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId1,
            Email = email,
            FullName = "OAuth Fallback User",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = fixedNow.AddDays(7),
            CreatedAt = fixedNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        _clerkLookupMock
            .Setup(c => c.GetVerifiedEmailsAsync("clerk_oauth_user_1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { "OAUTH.FALLBACK@METROHEALTH.PH" });

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_oauth_user_1", Array.Empty<string>());

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(token, result.Token);
        _clerkLookupMock.Verify(c => c.GetVerifiedEmailsAsync("clerk_oauth_user_1", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ClerkLookupFallback_WhenVerifiedEmailsListIsPresent_NeverCallsClerkLookup()
    {
        var fixedNow = DateTime.UtcNow;
        var token = "token_jwt_provided";
        var email = "jwt.provided@metrohealth.ph";

        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId1,
            Email = email,
            FullName = "JWT User",
            Role = WorkspaceMemberRole.Member,
            Status = MemberStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = fixedNow.AddDays(7),
            CreatedAt = fixedNow
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_jwt_user", new[] { email });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(token, result.Token);
        // Ensure no external Clerk API call is wasted when JWT claims already provide email
        _clerkLookupMock.Verify(c => c.GetVerifiedEmailsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ClerkLookupFallback_WhenClerkApiThrowsException_ReturnsNullWithoutCrashing()
    {
        var fixedNow = DateTime.UtcNow;

        _clerkLookupMock
            .Setup(c => c.GetVerifiedEmailsAsync("clerk_failing_user", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("Clerk Backend API returned 503 Service Unavailable"));

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_failing_user", Array.Empty<string>());

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Null(result);
    }

    [Fact]
    public async Task AdminUserRole_MapsRoleNameFromAdminRole()
    {
        var fixedNow = DateTime.UtcNow;
        var token = "token_admin_support_role";
        var email = "admin.support@clinicez.ph";

        var role = new AdminRole { Id = Guid.NewGuid(), Name = "Support Specialist" };
        _context.AdminRoles.Add(role);

        var admin = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = email,
            FullName = "Support Admin",
            RoleId = role.Id,
            Role = role,
            IsActive = true,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = fixedNow.AddDays(7),
            CreatedAt = fixedNow
        };
        _context.AdminUsers.Add(admin);
        await _context.SaveChangesAsync();

        var handler = CreateHandler(fixedNow);
        var query = new GetPendingSelfInvitationQuery("clerk_support_admin", new[] { email });

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(token, result.Token);
        Assert.Equal("Support Specialist", result.Role);
    }
}
