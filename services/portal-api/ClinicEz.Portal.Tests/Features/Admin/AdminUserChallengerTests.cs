using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Admin.DTOs;
using ClinicEz.Portal.Application.Features.Admin.Queries;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Portal.Tests.Features.Admin;

/// <summary>
/// Challenger 1 Adversarial & Empirical Test Harness for Milestone 1 (Platform Users & Admin Invitations).
/// Probes token entropy, dynamic expiration, state transitions, and security edge cases.
/// </summary>
public class AdminUserChallengerTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly Guid _roleId = Guid.NewGuid();
    private const string RoleName = "Test Governance Role";
    private const string FrontendUrl = "https://portal.clinicez.test";
    private readonly FixedFrontendUrl _urlProvider = new(FrontendUrl);

    public AdminUserChallengerTests()
    {
        _context = TestSupport.NewContext();
        _context.AdminRoles.Add(new AdminRole
        {
            Id = _roleId,
            Name = RoleName,
            Description = "Test role for empirical challenge",
            Permissions = new List<string> { "view:analytics" },
            CreatedAt = DateTime.UtcNow
        });
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    #region 1. Token Entropy & Uniqueness Empirical Probes

    [Fact]
    public void TokenGenerator_GeneratesExact64HexCharsWithHighEntropyAndZeroCollisions()
    {
        const int sampleSize = 50_000;
        var tokenSet = new HashSet<string>(sampleSize, StringComparer.Ordinal);
        var byteFrequencies = new int[256];
        var nibbleFrequencies = new int[16];

        for (int i = 0; i < sampleSize; i++)
        {
            var token = TokenGenerator.GenerateSecureToken(32);

            // Assert exact 64 characters length (32 bytes * 2 hex chars)
            Assert.Equal(64, token.Length);

            // Assert lowercase hexadecimal characters only
            for (int c = 0; c < token.Length; c++)
            {
                char ch = token[c];
                bool isHex = (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f');
                Assert.True(isHex, $"Character '{ch}' at position {c} is not lowercase hex.");

                int nibble = (ch >= '0' && ch <= '9') ? (ch - '0') : (ch - 'a' + 10);
                nibbleFrequencies[nibble]++;
            }

            // Decode bytes to compute byte-level frequency
            byte[] bytes = Convert.FromHexString(token);
            Assert.Equal(32, bytes.Length);
            foreach (var b in bytes)
            {
                byteFrequencies[b]++;
            }

            // Assert uniqueness
            Assert.True(tokenSet.Add(token), $"Collision detected on token: {token}");
        }

        // Calculate Shannon Entropy across 1,600,000 raw bytes (50,000 tokens * 32 bytes)
        double totalBytes = sampleSize * 32.0;
        double byteEntropy = 0.0;
        for (int i = 0; i < 256; i++)
        {
            if (byteFrequencies[i] > 0)
            {
                double p = byteFrequencies[i] / totalBytes;
                byteEntropy -= p * Math.Log2(p);
            }
        }

        // Theoretical maximum entropy for uniform 8-bit bytes is 8.0 bits/byte.
        // For 1.6 million samples, empirical entropy should exceed 7.999 bits/byte.
        Assert.True(byteEntropy >= 7.999, $"Shannon entropy was {byteEntropy:F5}, expected >= 7.999 bits/byte");

        // Verify uniform nibble distribution (~6.25% per character, within +/- 1% tolerance for 3.2M nibbles)
        double totalNibbles = sampleSize * 64.0;
        double expectedNibbleRatio = 1.0 / 16.0; // 0.0625
        for (int n = 0; n < 16; n++)
        {
            double ratio = nibbleFrequencies[n] / totalNibbles;
            Assert.InRange(ratio, expectedNibbleRatio - 0.005, expectedNibbleRatio + 0.005);
        }
    }

    #endregion

    #region 2. Dynamic Expiration Time-Travel Probes

    [Fact]
    public async Task DynamicExpiration_TransitionsPreciselyAtExpirationBoundary()
    {
        var startTime = new DateTimeOffset(2026, 10, 21, 12, 0, 0, TimeSpan.Zero);
        var clock = new TestClock(startTime);

        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "time_travel@clinicez.test",
            FullName = "Time Traveler",
            RoleId = _roleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = TokenGenerator.GenerateSecureToken(32),
            InvitationExpiresAt = startTime.UtcDateTime.AddDays(7),
            IsActive = true,
            CreatedAt = startTime.UtcDateTime
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var queryHandler = new GetAdminUsersQueryHandler(_context, _urlProvider, clock);
        var detailsHandler = new GetAdminInvitationDetailsQueryHandler(_context, clock);

        // 1. T = 0 -> Status is Invited
        var list1 = await queryHandler.Handle(new GetAdminUsersQuery(), CancellationToken.None);
        var item1 = list1.First(u => u.Id == user.Id);
        Assert.Equal("Invited", item1.DisplayStatus);
        Assert.Equal(AdminUserStatus.Invited, item1.Status);

        var details1 = await detailsHandler.Handle(new GetAdminInvitationDetailsQuery(user.InvitationToken!), CancellationToken.None);
        Assert.NotNull(details1);
        Assert.False(details1.IsExpired);

        // 2. Advance 6 days, 23 hours, 59 minutes -> Still Invited
        clock.Advance(TimeSpan.FromDays(6) + TimeSpan.FromHours(23) + TimeSpan.FromMinutes(59));
        var list2 = await queryHandler.Handle(new GetAdminUsersQuery(), CancellationToken.None);
        var item2 = list2.First(u => u.Id == user.Id);
        Assert.Equal("Invited", item2.DisplayStatus);

        var details2 = await detailsHandler.Handle(new GetAdminInvitationDetailsQuery(user.InvitationToken!), CancellationToken.None);
        Assert.NotNull(details2);
        Assert.False(details2.IsExpired);

        // 3. Advance 2 minutes (now 1 minute past the 7-day expiration boundary) -> Expired
        clock.Advance(TimeSpan.FromMinutes(2));
        var list3 = await queryHandler.Handle(new GetAdminUsersQuery(), CancellationToken.None);
        var item3 = list3.First(u => u.Id == user.Id);
        Assert.Equal("Expired", item3.DisplayStatus);
        // Note: DB status remains Invited while dynamic display status resolves to Expired
        Assert.Equal(AdminUserStatus.Invited, item3.Status);

        var details3 = await detailsHandler.Handle(new GetAdminInvitationDetailsQuery(user.InvitationToken!), CancellationToken.None);
        Assert.NotNull(details3);
        Assert.True(details3.IsExpired);

        // 4. Verification that AcceptAdminInvitationCommand rejects this expired invitation
        var acceptHandler = new AcceptAdminInvitationCommandHandler(_context, _urlProvider, clock);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            acceptHandler.Handle(new AcceptAdminInvitationCommand(user.InvitationToken!, "clerk_traveler_123"), CancellationToken.None)
        );
        Assert.Contains("expired", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(AdminUserStatus.Active, "Active")]
    [InlineData(AdminUserStatus.Suspended, "Suspended")]
    [InlineData(AdminUserStatus.Revoked, "Revoked")]
    public void DynamicExpiration_DoesNotOverrideTerminalOrNonInvitedStatuses(AdminUserStatus status, string expectedDisplay)
    {
        var pastDate = DateTime.UtcNow.AddDays(-10);
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = $"{status.ToString().ToLower()}@clinicez.test",
            FullName = $"{status} User",
            RoleId = _roleId,
            Status = status,
            InvitationExpiresAt = pastDate,
            IsActive = status == AdminUserStatus.Active
        };

        var dto = AdminUserMapping.ToDto(user, TimeProvider.System);
        Assert.Equal(expectedDisplay, dto.DisplayStatus);
    }

    #endregion

    #region 3. Full State Transition Machine Verification

    [Fact]
    public async Task StateTransitions_Invited_To_Active_UponAcceptance()
    {
        var token = TokenGenerator.GenerateSecureToken(32);
        var now = DateTime.UtcNow;
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "accept_transition@clinicez.test",
            FullName = "Accept Tester",
            RoleId = _roleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = now.AddDays(7),
            IsActive = true,
            CreatedAt = now
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, _urlProvider, TimeProvider.System);
        var result = await handler.Handle(new AcceptAdminInvitationCommand(token, "clerk_usr_trans"), CancellationToken.None);

        Assert.Equal(AdminUserStatus.Active, result.Status);
        Assert.Equal("Active", result.DisplayStatus);
        Assert.Equal("clerk_usr_trans", result.ClerkUserId);
        Assert.NotNull(result.JoinedAt);
        Assert.True(result.IsActive);

        var dbUser = await _context.AdminUsers.FindAsync(user.Id);
        Assert.Equal(AdminUserStatus.Active, dbUser!.Status);
        Assert.True(dbUser.IsActive);
        Assert.Equal("clerk_usr_trans", dbUser.ClerkUserId);
    }

    [Fact]
    public async Task StateTransitions_Invited_To_Revoked_And_Expired_To_Revoked()
    {
        // Case A: Invited (not expired) -> Revoked
        var userInvited = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "revoke_invited@clinicez.test",
            FullName = "Revoke Invited",
            RoleId = _roleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = TokenGenerator.GenerateSecureToken(32),
            InvitationExpiresAt = DateTime.UtcNow.AddDays(5),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        // Case B: Expired -> Revoked
        var userExpired = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "revoke_expired@clinicez.test",
            FullName = "Revoke Expired",
            RoleId = _roleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = TokenGenerator.GenerateSecureToken(32),
            InvitationExpiresAt = DateTime.UtcNow.AddDays(-2),
            IsActive = true,
            CreatedAt = DateTime.UtcNow.AddDays(-9)
        };

        _context.AdminUsers.AddRange(userInvited, userExpired);
        await _context.SaveChangesAsync();

        var revokeHandler = new RevokeAdminInvitationCommandHandler(_context, _urlProvider, TimeProvider.System);

        var resA = await revokeHandler.Handle(new RevokeAdminInvitationCommand(userInvited.Id, "AdminCaller"), CancellationToken.None);
        Assert.Equal(AdminUserStatus.Revoked, resA.Status);
        Assert.Equal("Revoked", resA.DisplayStatus);

        var resB = await revokeHandler.Handle(new RevokeAdminInvitationCommand(userExpired.Id, "AdminCaller"), CancellationToken.None);
        Assert.Equal(AdminUserStatus.Revoked, resB.Status);
        Assert.Equal("Revoked", resB.DisplayStatus);

        // Verification: Acceptance on revoked user must fail
        var acceptHandler = new AcceptAdminInvitationCommandHandler(_context, _urlProvider, TimeProvider.System);
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            acceptHandler.Handle(new AcceptAdminInvitationCommand(userInvited.InvitationToken!, "clerk_1"), CancellationToken.None)
        );
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            acceptHandler.Handle(new AcceptAdminInvitationCommand(userExpired.InvitationToken!, "clerk_2"), CancellationToken.None)
        );
    }

    [Fact]
    public async Task StateTransitions_Expired_To_Resend_RegeneratesTokenAndResets7DayWindow()
    {
        var oldToken = TokenGenerator.GenerateSecureToken(32);
        var expiredUser = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "expired_resend@clinicez.test",
            FullName = "Expired Resend",
            RoleId = _roleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = oldToken,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(-3),
            IsActive = true,
            CreatedAt = DateTime.UtcNow.AddDays(-10)
        };
        _context.AdminUsers.Add(expiredUser);
        await _context.SaveChangesAsync();

        var resendHandler = new ResendAdminInvitationCommandHandler(
            _context,
            TestSupport.AdminInvitationNotifier(_context, FrontendUrl),
            _urlProvider,
            TimeProvider.System
        );

        var resendResult = await resendHandler.Handle(new ResendAdminInvitationCommand(expiredUser.Id, "SuperAdmin"), CancellationToken.None);

        Assert.NotNull(resendResult);
        Assert.NotEqual(oldToken, resendResult.InvitationToken);
        Assert.Equal(64, resendResult.InvitationToken!.Length);
        Assert.Equal(AdminUserStatus.Invited, resendResult.Status);
        Assert.Equal("Invited", resendResult.DisplayStatus);
        Assert.True(resendResult.InvitationExpiresAt > DateTime.UtcNow.AddDays(6));

        // Now acceptance with the fresh token must succeed
        var acceptHandler = new AcceptAdminInvitationCommandHandler(_context, _urlProvider, TimeProvider.System);
        var acceptResult = await acceptHandler.Handle(new AcceptAdminInvitationCommand(resendResult.InvitationToken, "clerk_newly_accepted"), CancellationToken.None);
        Assert.Equal(AdminUserStatus.Active, acceptResult.Status);
        Assert.Equal("Active", acceptResult.DisplayStatus);
    }

    #endregion

    #region 4. Adversarial Probes & Security Edge Cases

    [Fact]
    public async Task CaseInsensitiveTokenHandling_MatchesUpperCaseInput()
    {
        var rawToken = TokenGenerator.GenerateSecureToken(32); // lowercase hex
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "case_test@clinicez.test",
            FullName = "Case Sensitive Prober",
            RoleId = _roleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = rawToken,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(5),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var upperToken = rawToken.ToUpperInvariant();

        // Details query with uppercase token
        var queryHandler = new GetAdminInvitationDetailsQueryHandler(_context, TimeProvider.System);
        var details = await queryHandler.Handle(new GetAdminInvitationDetailsQuery(upperToken), CancellationToken.None);
        Assert.NotNull(details);
        Assert.Equal("case_test@clinicez.test", details.Email);

        // Accept query with uppercase token
        var acceptHandler = new AcceptAdminInvitationCommandHandler(_context, _urlProvider, TimeProvider.System);
        var accepted = await acceptHandler.Handle(new AcceptAdminInvitationCommand(upperToken, "clerk_case_user"), CancellationToken.None);
        Assert.Equal(AdminUserStatus.Active, accepted.Status);
    }

    [Fact]
    public async Task AcceptInvitation_DoubleAcceptanceByDifferentUser_Throws()
    {
        var token = TokenGenerator.GenerateSecureToken(32);
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "double_accept@clinicez.test",
            FullName = "Double Acceptor",
            RoleId = _roleId,
            Status = AdminUserStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(5),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        var handler = new AcceptAdminInvitationCommandHandler(_context, _urlProvider, TimeProvider.System);

        // First acceptance succeeds
        var first = await handler.Handle(new AcceptAdminInvitationCommand(token, "clerk_first_claimer"), CancellationToken.None);
        Assert.Equal(AdminUserStatus.Active, first.Status);

        // Second acceptance by different user MUST throw
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AcceptAdminInvitationCommand(token, "clerk_second_intruder"), CancellationToken.None)
        );
        Assert.Contains("already been accepted", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task SuspendAdminUser_CannotReactivateThroughInvitationToken()
    {
        // Adversarial Scenario:
        // A user is invited and accepts. Later, the user is SUSPENDED.
        // What happens if someone tries to call AcceptAdminInvitation with the original token?
        var token = TokenGenerator.GenerateSecureToken(32);
        var user = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "suspended_recon@clinicez.test",
            FullName = "Suspended Person",
            RoleId = _roleId,
            Status = AdminUserStatus.Active,
            ClerkUserId = "clerk_suspended_guy",
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(5),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(user);
        await _context.SaveChangesAsync();

        // 1. SuperAdmin suspends this user
        var suspendHandler = new SuspendAdminUserCommandHandler(_context, _urlProvider, TimeProvider.System);
        var suspendedDto = await suspendHandler.Handle(new SuspendAdminUserCommand(user.Id, "SuperAdmin", "clerk_admin"), CancellationToken.None);
        Assert.Equal(AdminUserStatus.Suspended, suspendedDto.Status);
        Assert.False(suspendedDto.IsActive);

        // 2. Suspended user attempts to call AcceptAdminInvitationCommand with the token
        var acceptHandler = new AcceptAdminInvitationCommandHandler(_context, _urlProvider, TimeProvider.System);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            acceptHandler.Handle(new AcceptAdminInvitationCommand(token, "clerk_suspended_guy"), CancellationToken.None)
        );
        Assert.Contains("suspended", ex.Message, StringComparison.OrdinalIgnoreCase);

        var dbUser = await _context.AdminUsers.FindAsync(user.Id);
        Assert.Equal(AdminUserStatus.Suspended, dbUser!.Status);
        Assert.False(dbUser.IsActive);
    }

    [Fact]
    public async Task ResendInvitation_RevokedOrActive_ExplicitlyBlocked()
    {
        var activeUser = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "active_blocked@clinicez.test",
            FullName = "Active Blocked",
            RoleId = _roleId,
            Status = AdminUserStatus.Active,
            ClerkUserId = "clerk_act",
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        var revokedUser = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "revoked_blocked@clinicez.test",
            FullName = "Revoked Blocked",
            RoleId = _roleId,
            Status = AdminUserStatus.Revoked,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.AddRange(activeUser, revokedUser);
        await _context.SaveChangesAsync();

        var resendHandler = new ResendAdminInvitationCommandHandler(
            _context,
            TestSupport.AdminInvitationNotifier(_context, FrontendUrl),
            _urlProvider,
            TimeProvider.System
        );

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            resendHandler.Handle(new ResendAdminInvitationCommand(activeUser.Id, "SuperAdmin"), CancellationToken.None)
        );

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            resendHandler.Handle(new ResendAdminInvitationCommand(revokedUser.Id, "SuperAdmin"), CancellationToken.None)
        );
    }

    [Fact]
    public async Task ResendInvitation_SuspendedUser_ProbesStateCorruption()
    {
        var suspendedUser = new AdminUser
        {
            Id = Guid.NewGuid(),
            Email = "suspended_resend@clinicez.test",
            FullName = "Suspended Resend",
            RoleId = _roleId,
            Status = AdminUserStatus.Suspended,
            ClerkUserId = "clerk_susp",
            IsActive = false,
            CreatedAt = DateTime.UtcNow
        };
        _context.AdminUsers.Add(suspendedUser);
        await _context.SaveChangesAsync();

        var resendHandler = new ResendAdminInvitationCommandHandler(
            _context,
            TestSupport.AdminInvitationNotifier(_context, FrontendUrl),
            _urlProvider,
            TimeProvider.System
        );

        // ResendAdminInvitationCommand must strictly reject Suspended users
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            resendHandler.Handle(new ResendAdminInvitationCommand(suspendedUser.Id, "SuperAdmin"), CancellationToken.None)
        );
        Assert.Contains("suspended", ex.Message, StringComparison.OrdinalIgnoreCase);

        var dbUser = await _context.AdminUsers.FindAsync(suspendedUser.Id);
        Assert.Equal(AdminUserStatus.Suspended, dbUser!.Status);
        Assert.False(dbUser.IsActive);
    }

    #endregion
}
