using System;
using System.Collections.Generic;
using System.Security.Claims;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Infrastructure.Context;
using ClinicEz.Shared.LocalAuth;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ClinicContextSecurityTests
{
    private static ClinicContext Create(HttpContext? http, params (string Key, string Value)[] config)
    {
        var accessor = Substitute.For<IHttpContextAccessor>();
        accessor.HttpContext.Returns(http);
        var cfg = new ConfigurationBuilder()
            .AddInMemoryCollection(config.Length == 0
                ? new Dictionary<string, string?>()
                : new Dictionary<string, string?>(Array.ConvertAll(config, c => new KeyValuePair<string, string?>(c.Key, c.Value))))
            .Build();
        return new ClinicContext(accessor, cfg);
    }

    [Fact]
    public void Anonymous_HasNoPermissions_AndNoClinic_EvenWithForgedHeaders()
    {
        var http = new DefaultHttpContext();
        http.Request.Headers["X-Permissions"] = "*";
        http.Request.Headers["X-Staff-Id"] = Guid.NewGuid().ToString();

        var ctx = Create(http);

        ctx.Permissions.Should().BeEmpty();
        ctx.HasPermission(ClinicPermissions.PatientsRead).Should().BeFalse();
        ctx.StaffId.Should().BeNull();
        ctx.ClinicId.Should().Be(ClinicContext.UnauthenticatedClinicId);
        ctx.ClinicId.Should().NotBe(Guid.Empty, "an empty clinic id would bypass the global query filters");
    }

    [Fact]
    public void Anonymous_NeverFallsBackToTheLegacyFixedClinicGuid_NorToAllPermissions()
    {
        var ctx = Create(new DefaultHttpContext());

        ctx.ClinicId.Should().NotBe(Guid.Parse("11111111-1111-1111-1111-111111111111"));
        ctx.Permissions.Should().NotContain("*");
        ctx.Permissions.Count.Should().Be(0);
    }

    [Fact]
    public void Anonymous_UsesScopeResolvedByMiddleware_ForPublicTokenEndpoints()
    {
        var clinic = Guid.NewGuid();
        var http = new DefaultHttpContext();
        http.Items[ClinicContext.InternalTenantItemKey] = "tenant-a";
        http.Items[ClinicContext.InternalClinicItemKey] = clinic;

        var ctx = Create(http);

        ctx.ClinicId.Should().Be(clinic);
        ctx.TenantId.Should().Be("tenant-a");
        ctx.Permissions.Should().BeEmpty("scoping a public request must never grant permissions");
    }

    [Fact]
    public void Anonymous_UsesWorkspaceHintHeaders_ForLicenseAndAuthEndpoints()
    {
        var clinic = Guid.NewGuid();
        var http = new DefaultHttpContext();
        http.Request.Headers["X-Tenant-Id"] = "my-workspace";
        http.Request.Headers["X-Clinic-Id"] = clinic.ToString();

        var ctx = Create(http);

        ctx.TenantId.Should().Be("my-workspace");
        ctx.ClinicId.Should().Be(clinic);
        ctx.Permissions.Should().BeEmpty();
    }

    [Fact]
    public void Staff_ScopeComesOnlyFromClaims()
    {
        var clinic = Guid.NewGuid();
        var staff = Guid.NewGuid();
        var http = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(new[]
            {
                new Claim(ClinicClaimTypes.Subject, staff.ToString()),
                new Claim(ClinicClaimTypes.TenantId, "tenant-real"),
                new Claim(ClinicClaimTypes.ClinicId, clinic.ToString()),
                new Claim(ClinicClaimTypes.Permission, ClinicPermissions.BillingRead)
            }, "Facility"))
        };
        http.Request.Headers["X-Tenant-Id"] = "tenant-forged";
        http.Request.Headers["X-Clinic-Id"] = Guid.NewGuid().ToString();
        http.Request.Headers["X-Staff-Id"] = Guid.NewGuid().ToString();

        var ctx = Create(http);

        ctx.TenantId.Should().Be("tenant-real");
        ctx.ClinicId.Should().Be(clinic);
        ctx.StaffId.Should().Be(staff);
        ctx.HasPermission(ClinicPermissions.BillingRead).Should().BeTrue();
        ctx.HasPermission(ClinicPermissions.BillingVoid).Should().BeFalse();
    }

    [Fact]
    public void Staff_WithoutClinicClaim_FailsClosed()
    {
        var http = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClinicClaimTypes.Subject, Guid.NewGuid().ToString()) }, "Facility"))
        };

        Create(http).ClinicId.Should().Be(ClinicContext.UnauthenticatedClinicId);
    }

    [Fact]
    public void InternalService_GetsOnlyTheMinimalServicePermissionSet()
    {
        var http = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(FacilityAuthSchemes.InternalClaim, "true") }, "Internal"))
        };
        http.Request.Headers["X-Tenant-Id"] = "tenant-x";

        var ctx = Create(http);

        ctx.TenantId.Should().Be("tenant-x");
        ctx.HasPermission(ClinicPermissions.YakapSubmit).Should().BeTrue();
        ctx.HasPermission(ClinicPermissions.StaffManage).Should().BeFalse();
        ctx.HasPermission(ClinicPermissions.RolesManage).Should().BeFalse();
        ctx.HasPermission(ClinicPermissions.SettingsManage).Should().BeFalse();
        ctx.StaffId.Should().BeNull();
    }

    [Fact]
    public void BackgroundScope_UsesConfiguredClinic_AndTrustedSystemPermissions()
    {
        var clinic = Guid.NewGuid();
        var ctx = Create(null, ("ClinicSettings:ClinicId", clinic.ToString()), ("ClinicSettings:TenantId", "tenant-cfg"));

        ctx.ClinicId.Should().Be(clinic);
        ctx.TenantId.Should().Be("tenant-cfg");
        ctx.Permissions.Should().BeEquivalentTo(ClinicPermissions.All);
    }
}
