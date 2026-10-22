using System;
using System.Linq;
using ClinicEz.Clinic.Application.Features.Staff.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.CrossDomainParity;

/// <summary>
/// Milestone 4 Cross-Domain Alignment Verification:
/// Verifies standardized status tracking, dynamic expiration, and audit timestamps
/// for Tier 3 (Clinic Staff).
/// </summary>
public class CrossDomainStatusAndAuditParityTests
{
    private static readonly string[] ExpectedCorePersistedStatuses = ["Invited", "Active", "Suspended", "Revoked"];

    [Fact]
    public void Tier3_StaffAccountStatus_HasExactlyFourCorePersistedStatuses_AndNeverPersistsExpired()
    {
        var names = Enum.GetNames<StaffAccountStatus>();

        Assert.Equal(4, names.Length);
        Assert.Equal(ExpectedCorePersistedStatuses, names);
        Assert.DoesNotContain("Expired", names);
    }

    [Fact]
    public void Tier3_StaffMember_PersistsAllRequiredAuditTimestamps()
    {
        var now = DateTime.UtcNow;
        var expires = now.AddDays(7);
        var accepted = now.AddHours(2);

        var staffMember = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_parity_test",
            ClinicId = Guid.NewGuid(),
            FirstName = "Maria",
            LastName = "Santos",
            Role = StaffRole.Doctor,
            Status = StaffAccountStatus.Invited,
            CreatedAt = now,
            CreatedBy = "clinicadmin@clinicez.ph",
            InvitationExpiresAt = expires,
            InviteAcceptedAt = accepted
        };

        Assert.Equal(now, staffMember.CreatedAt);
        Assert.Equal("clinicadmin@clinicez.ph", staffMember.CreatedBy);
        Assert.Equal(expires, staffMember.InvitationExpiresAt);
        Assert.Equal(accepted, staffMember.InviteAcceptedAt);
    }

    [Fact]
    public void Tier3_StaffMemberDto_DynamicallyResolvesExpiredWithoutMutatingPersistedStatus()
    {
        var now = DateTime.UtcNow;
        var expiredTime = now.AddMinutes(-10);

        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_parity_test",
            ClinicId = Guid.NewGuid(),
            FirstName = "Jose",
            LastName = "Rizal",
            Role = StaffRole.Doctor,
            Status = StaffAccountStatus.Invited,
            InvitationToken = "tok_clinic_hex_64",
            InvitationExpiresAt = expiredTime,
            CreatedAt = now.AddDays(-7),
            CreatedBy = "admin"
        };

        var dto = new StaffMemberDto(
            staff.Id,
            staff.TenantId,
            staff.ClinicId,
            null,
            null,
            staff.FirstName,
            staff.LastName,
            null,
            null,
            staff.Role,
            staff.Email,
            null,
            null,
            null,
            null,
            null,
            staff.IsActive,
            staff.CreatedAt,
            Status: staff.Status,
            InvitationToken: staff.InvitationToken,
            InvitationExpiresAt: staff.InvitationExpiresAt,
            InviteAcceptedAt: staff.InviteAcceptedAt
        );

        // Dynamically resolved expiration
        Assert.True(dto.IsExpired);
        // Persisted status is strictly Invited (not Expired)
        Assert.Equal(StaffAccountStatus.Invited, dto.Status);
        Assert.Equal(staff.CreatedAt, dto.CreatedAt);
        Assert.Equal(expiredTime, dto.InvitationExpiresAt);
    }

    [Fact]
    public void Tier3_StaffMemberDto_IsExpiredIsFalse_WhenInvitationExpiresInFuture()
    {
        var now = DateTime.UtcNow;
        var futureExpiry = now.AddDays(5);

        var dto = new StaffMemberDto(
            Guid.NewGuid(),
            "tenant_parity_test",
            Guid.NewGuid(),
            null,
            null,
            "Clara",
            "Cruz",
            null,
            null,
            StaffRole.Nurse,
            "clara@nurse.ph",
            null,
            null,
            null,
            null,
            null,
            true,
            now,
            Status: StaffAccountStatus.Invited,
            InvitationToken: "tok_future_hex",
            InvitationExpiresAt: futureExpiry
        );

        Assert.False(dto.IsExpired);
        Assert.Equal(StaffAccountStatus.Invited, dto.Status);
    }

    [Fact]
    public void Tier3_StaffMemberDto_IsExpiredIsFalse_WhenAccountIsActiveEvenWithPastExpiry()
    {
        var now = DateTime.UtcNow;
        var pastExpiry = now.AddDays(-1);

        var dto = new StaffMemberDto(
            Guid.NewGuid(),
            "tenant_parity_test",
            Guid.NewGuid(),
            null,
            null,
            "Juan",
            "Luna",
            null,
            null,
            StaffRole.Doctor,
            "juan@luna.ph",
            null,
            null,
            null,
            null,
            null,
            true,
            now.AddDays(-10),
            Status: StaffAccountStatus.Active,
            InvitationToken: null,
            InvitationExpiresAt: pastExpiry,
            InviteAcceptedAt: now.AddDays(-1)
        );

        Assert.False(dto.IsExpired);
        Assert.Equal(StaffAccountStatus.Active, dto.Status);
    }

    [Fact]
    public void ClinicDbContext_ConfiguresStringConversions_ForStaffMemberStatus()
    {
        var clinicContext = NSubstitute.Substitute.For<ClinicEz.Clinic.Domain.Interfaces.IClinicContext>();
        var (context, _, _) = TestDbHelper.CreateTestContext(clinicContext);
        using (context)
        {
            var model = context.Model;

            var staffEntityType = model.FindEntityType(typeof(StaffMember));
            Assert.NotNull(staffEntityType);

            var statusProp = staffEntityType.FindProperty(nameof(StaffMember.Status));
            Assert.NotNull(statusProp);
            Assert.Equal(50, statusProp.GetMaxLength());
        }
    }
}
