using System;
using System.Collections.Generic;
using System.Security.Claims;
using ClinicEz.Pharmacy.Domain.Constants;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Infrastructure.Context;
using ClinicEz.Shared.LocalAuth;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;

namespace ClinicEz.Pharmacy.Application.Tests;

public class PharmacyContextSecurityTests
{
    private static PharmacyContext Create(HttpContext? http, params (string Key, string Value)[] config)
    {
        var accessor = Substitute.For<IHttpContextAccessor>();
        accessor.HttpContext.Returns(http);
        var cfg = new ConfigurationBuilder()
            .AddInMemoryCollection(config.Length == 0
                ? new Dictionary<string, string?>()
                : new Dictionary<string, string?>(Array.ConvertAll(config, c => new KeyValuePair<string, string?>(c.Key, c.Value))))
            .Build();
        return new PharmacyContext(accessor, cfg);
    }

    [Fact]
    public void Anonymous_HasNoPermissions_AndNoPharmacy_EvenWithForgedHeaders()
    {
        var http = new DefaultHttpContext();
        http.Request.Headers["X-Permissions"] = "*";
        http.Request.Headers["X-Tenant-Id"] = "victim";
        http.Request.Headers["X-Facility-Id"] = Guid.NewGuid().ToString();

        var ctx = Create(http);

        ctx.Permissions.Should().BeEmpty();
        ctx.HasPermission(PharmacyPermissions.InventoryRead).Should().BeFalse();
        ctx.StaffId.Should().BeNull();
        ctx.TenantId.Should().BeEmpty();
        ctx.PharmacyId.Should().Be(PharmacyContext.UnauthenticatedPharmacyId);
        ctx.PharmacyId.Should().NotBe(Guid.Empty);
    }

    [Fact]
    public void Staff_ScopeComesOnlyFromClaims()
    {
        var pharmacy = Guid.NewGuid();
        var staff = Guid.NewGuid();
        var http = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(new[]
            {
                new Claim(PharmacyClaimTypes.Subject, staff.ToString()),
                new Claim(PharmacyClaimTypes.TenantId, "tenant-real"),
                new Claim(PharmacyClaimTypes.PharmacyId, pharmacy.ToString()),
                new Claim(PharmacyClaimTypes.Permission, PharmacyPermissions.InventoryRead)
            }, "Facility"))
        };
        http.Request.Headers["X-Tenant-Id"] = "tenant-forged";
        http.Request.Headers["X-Facility-Id"] = Guid.NewGuid().ToString();
        http.Request.Headers["X-Permissions"] = "*";

        var ctx = Create(http);

        ctx.TenantId.Should().Be("tenant-real");
        ctx.PharmacyId.Should().Be(pharmacy);
        ctx.StaffId.Should().Be(staff);
        ctx.HasPermission(PharmacyPermissions.InventoryRead).Should().BeTrue();
        ctx.HasPermission(PharmacyPermissions.InventoryManage).Should().BeFalse();
        ctx.HasPermission(PharmacyPermissions.GamotDispense).Should().BeFalse();
    }

    [Fact]
    public void Staff_WithoutPharmacyClaim_FailsClosed()
    {
        var http = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(PharmacyClaimTypes.Subject, Guid.NewGuid().ToString()) }, "Facility"))
        };

        Create(http).PharmacyId.Should().Be(PharmacyContext.UnauthenticatedPharmacyId);
    }

    [Fact]
    public void ServicePrincipalWithoutStaffClaims_FailsClosed_EvenWithForgedScopeHeaders()
    {
        var http = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(FacilityAuthSchemes.InternalClaim, "true") }, "Internal"))
        };
        http.Request.Headers["X-Tenant-Id"] = "tenant-x";
        http.Request.Headers["X-Facility-Id"] = Guid.NewGuid().ToString();

        var ctx = Create(http);

        ctx.TenantId.Should().BeEmpty();
        ctx.PharmacyId.Should().Be(PharmacyContext.UnauthenticatedPharmacyId);
        ctx.StaffId.Should().BeNull();
        ctx.Permissions.Should().BeEmpty();
    }

    [Fact]
    public void BackgroundScope_UsesConfiguredPharmacy_AndTrustedSystemPermissions()
    {
        var pharmacy = Guid.NewGuid();
        var ctx = Create(null, ("PharmacySettings:PharmacyId", pharmacy.ToString()), ("PharmacySettings:TenantId", "tenant-cfg"));

        ctx.PharmacyId.Should().Be(pharmacy);
        ctx.TenantId.Should().Be("tenant-cfg");
        ctx.Permissions.Should().BeEquivalentTo(PharmacyPermissions.All);
    }

    [Theory]
    [InlineData(PharmacyStaffRole.ChiefPharmacist)]
    [InlineData(PharmacyStaffRole.StaffPharmacist)]
    [InlineData(PharmacyStaffRole.PharmacyAssistant)]
    [InlineData(PharmacyStaffRole.Cashier)]
    [InlineData(PharmacyStaffRole.InventoryClerk)]
    public void EveryRole_OnlyReceivesKnownPermissions(PharmacyStaffRole role)
    {
        PharmacyRolePermissions.For(role).Should().NotBeEmpty().And.BeSubsetOf(PharmacyPermissions.All);
    }

    [Fact]
    public void ChiefPharmacist_HasEverything_AndOthersDoNotManageStaff()
    {
        PharmacyRolePermissions.For(PharmacyStaffRole.ChiefPharmacist).Should().BeEquivalentTo(PharmacyPermissions.All);

        foreach (var role in Enum.GetValues<PharmacyStaffRole>())
        {
            if (role == PharmacyStaffRole.ChiefPharmacist) continue;
            PharmacyRolePermissions.For(role).Should().NotContain(PharmacyPermissions.StaffManage)
                .And.NotContain(PharmacyPermissions.InventoryManage);
        }
    }
}
